const DEFAULT_PAYMENT_PLANS = {
  profesional: {
    description: "Estudios, coordinadores BIM y equipos de proyecto.",
    label: "Profesional",
    prices: {
      mensual: 79,
      anual: 790,
    },
  },
  estudiante: {
    description: "Acceso completo con descuento academico.",
    label: "Estudiante",
    prices: {
      mensual: 39,
      anual: 390,
    },
  },
};

let cachedGoogleToken = null;
let cachedJwks = null;

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers, status: 204 });
    }

    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        return json({ ok: true, service: "InfraBIM payments worker" }, headers);
      }

      if (request.method === "POST" && url.pathname === "/create-card-subscription") {
        return createCardSubscription(request, env, headers);
      }

      if (request.method === "POST" && url.pathname === "/create-yape-payment") {
        return createYapePayment(request, env, headers);
      }

      if (request.method === "POST" && url.pathname === "/mercado-pago-webhook") {
        return mercadoPagoWebhook(request, env, headers);
      }

      return json({ message: "Ruta no encontrada." }, headers, 404);
    } catch (error) {
      return json(
        { message: error instanceof Error ? error.message : "No se pudo procesar la solicitud." },
        headers,
        500,
      );
    }
  },
};

async function createCardSubscription(request, env, headers) {
  assertEnv(env);
  const user = await getFirebaseUser(request, env);
  const { billingCycle, cardTokenId, payerEmail, planId } = await request.json();
  const { amount, plan } = await getPlan(env, planId, billingCycle);
  const email = cleanEmail(payerEmail, user.email);

  if (!cardTokenId) {
    return json({ message: "Token de tarjeta requerido." }, headers, 400);
  }

  const externalReference = `${user.uid}:${planId}:${billingCycle}:${Date.now()}`;
  const response = await mercadoPagoRequest(
    "/preapproval",
    {
      auto_recurring: {
        currency_id: "PEN",
        frequency: billingCycle === "anual" ? 12 : 1,
        frequency_type: "months",
        transaction_amount: amount,
      },
      back_url: env.APP_BASE_URL || "https://infrabimss.web.app/planes",
      card_token_id: cardTokenId,
      external_reference: externalReference,
      payer_email: email,
      reason: `InfraBIM ${plan.label}`,
      status: "authorized",
    },
    env,
  );

  await savePaymentRecord(env, "subscriptions", response.id, {
    amount,
    billingCycle,
    createdAt: new Date(),
    externalReference,
    mercadoPagoId: response.id,
    ownerEmail: email,
    ownerUid: user.uid,
    paymentMethodId: response.payment_method_id || "card",
    planId,
    status: response.status || "pending",
    type: "card_subscription",
  });
  await updateUserPlan(env, user.uid, {
    billingCycle,
    expiresAt: null,
    mercadoPagoId: response.id,
    method: "card",
    planId,
    status: response.status || "pending",
    updatedAt: new Date(),
  });

  return json(
    {
      id: response.id,
      initPoint: response.init_point,
      status: response.status,
    },
    headers,
  );
}

async function createYapePayment(request, env, headers) {
  assertEnv(env);
  const user = await getFirebaseUser(request, env);
  const { billingCycle, payerEmail, planId, yapeToken } = await request.json();
  const { amount, plan } = await getPlan(env, planId, billingCycle);
  const email = cleanEmail(payerEmail, user.email);

  if (!yapeToken) {
    return json({ message: "Token de Yape requerido." }, headers, 400);
  }

  const response = await mercadoPagoRequest(
    "/v1/payments",
    {
      description: `InfraBIM ${plan.label} ${billingCycle}`,
      installments: 1,
      payer: {
        email,
      },
      payment_method_id: "yape",
      token: yapeToken,
      transaction_amount: amount,
    },
    env,
  );
  const approved = response.status === "approved";

  await savePaymentRecord(env, "payments", response.id, {
    amount,
    billingCycle,
    createdAt: new Date(),
    mercadoPagoId: response.id,
    ownerEmail: email,
    ownerUid: user.uid,
    paymentMethodId: "yape",
    planId,
    status: response.status || "pending",
    statusDetail: response.status_detail || "",
    type: "yape_payment",
  });

  if (approved) {
    await updateUserPlan(env, user.uid, {
      billingCycle,
      expiresAt: planEndDate(billingCycle),
      mercadoPagoId: response.id,
      method: "yape",
      planId,
      status: response.status,
      updatedAt: new Date(),
    });
  }

  return json(
    {
      id: response.id,
      status: response.status,
      statusDetail: response.status_detail,
    },
    headers,
  );
}

async function mercadoPagoWebhook(request, env, headers) {
  assertEnv(env);
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const eventId = crypto.randomUUID();

  await savePaymentRecord(env, "paymentWebhookEvents", eventId, {
    body,
    createdAt: new Date(),
    query: Object.fromEntries(url.searchParams.entries()),
    source: "mercado_pago",
  });

  const resourceId = body?.data?.id || url.searchParams.get("id");
  const type = body?.type || url.searchParams.get("topic") || url.searchParams.get("type");

  if (resourceId && type) {
    await refreshMercadoPagoResource(env, String(type), String(resourceId));
  }

  return json({ ok: true }, headers);
}

async function refreshMercadoPagoResource(env, type, resourceId) {
  if (type.includes("payment")) {
    const payment = await mercadoPagoGet(`/v1/payments/${resourceId}`, env);
    await savePaymentRecord(env, "payments", payment.id, {
      mercadoPagoId: payment.id,
      status: payment.status || "pending",
      statusDetail: payment.status_detail || "",
      updatedAt: new Date(),
    });
    return;
  }

  if (type.includes("preapproval") || type.includes("subscription")) {
    const subscription = await mercadoPagoGet(`/preapproval/${resourceId}`, env);
    await savePaymentRecord(env, "subscriptions", subscription.id, {
      mercadoPagoId: subscription.id,
      status: subscription.status || "pending",
      updatedAt: new Date(),
    });
  }
}

function assertEnv(env) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Falta MERCADO_PAGO_ACCESS_TOKEN en Cloudflare Workers.");
  }

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("Falta FIREBASE_PROJECT_ID o FIREBASE_SERVICE_ACCOUNT en Cloudflare Workers.");
  }
}

async function getFirebaseUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Error("Inicia sesion para procesar pagos.");
  }

  const payload = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);

  return {
    email: payload.email || "",
    uid: payload.sub,
  };
}

async function verifyFirebaseToken(token, projectId) {
  const [headerSegment, payloadSegment, signatureSegment] = token.split(".");

  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new Error("Token Firebase no valido.");
  }

  const header = JSON.parse(textFromBase64Url(headerSegment));
  const payload = JSON.parse(textFromBase64Url(payloadSegment));

  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Token Firebase no pertenece a InfraBIM.");
  }

  if (!payload.sub || payload.exp * 1000 < Date.now()) {
    throw new Error("Token Firebase expirado.");
  }

  const jwks = await getFirebaseJwks();
  const jwk = jwks.keys.find((key) => key.kid === header.kid);

  if (!jwk) {
    throw new Error("No se encontro llave publica Firebase para validar sesion.");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64UrlToBytes(signatureSegment),
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
  );

  if (!valid) {
    throw new Error("Firma Firebase no valida.");
  }

  return payload;
}

async function getFirebaseJwks() {
  if (cachedJwks?.expiresAt > Date.now()) {
    return cachedJwks.value;
  }

  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  );

  if (!response.ok) {
    throw new Error("No se pudieron cargar llaves publicas de Firebase.");
  }

  const value = await response.json();
  cachedJwks = {
    expiresAt: Date.now() + 60 * 60 * 1000,
    value,
  };

  return value;
}

async function getPlan(env, planId, billingCycle) {
  const paymentPlans = await getPaymentPlans(env);
  const plan = paymentPlans[planId];
  const amount = Number(plan?.prices?.[billingCycle]);

  if (!plan || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Plan o frecuencia no valida.");
  }

  return { amount, plan };
}

async function getPaymentPlans(env) {
  const document = await getFirestoreDocument(env, "system/paymentPlans");

  if (!document?.fields) {
    return DEFAULT_PAYMENT_PLANS;
  }

  return normalizePaymentPlans(fromFirestoreFields(document.fields));
}

function normalizePaymentPlans(data = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_PAYMENT_PLANS).map(([planId, fallback]) => {
      const source = data[planId] || {};
      const monthlyPrice = Number(source?.prices?.mensual);
      const annualPrice = Number(source?.prices?.anual);

      return [
        planId,
        {
          description: source.description || fallback.description,
          label: source.label || fallback.label,
          prices: {
            mensual:
              Number.isFinite(monthlyPrice) && monthlyPrice > 0 ? monthlyPrice : fallback.prices.mensual,
            anual: Number.isFinite(annualPrice) && annualPrice > 0 ? annualPrice : fallback.prices.anual,
          },
        },
      ];
    }),
  );
}

function cleanEmail(email, fallback) {
  const value = String(email || fallback || "").trim().toLowerCase();

  if (!value.includes("@")) {
    throw new Error("Mercado Pago requiere un correo de pagador.");
  }

  return value;
}

async function mercadoPagoRequest(path, body, env) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "x-idempotency-key": crypto.randomUUID(),
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Mercado Pago rechazo la operacion.");
  }

  return payload;
}

async function mercadoPagoGet(path, env) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || "No se pudo consultar Mercado Pago.");
  }

  return payload;
}

async function savePaymentRecord(env, collection, documentId, data) {
  await patchFirestoreDocument(env, `${collection}/${encodeURIComponent(String(documentId))}`, data);
}

async function updateUserPlan(env, uid, subscription) {
  await patchFirestoreDocument(env, `users/${encodeURIComponent(uid)}`, { subscription }, ["subscription"]);
}

async function patchFirestoreDocument(env, documentPath, data, updateMask = []) {
  const accessToken = await getGoogleAccessToken(env);
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const projectId = serviceAccount.project_id || env.FIREBASE_PROJECT_ID;
  const mask = updateMask.length ? updateMask : Object.keys(data);
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
  );

  mask.forEach((fieldPath) => url.searchParams.append("updateMask.fieldPaths", fieldPath));

  const response = await fetch(url.toString(), {
    body: JSON.stringify({
      fields: toFirestoreFields(data),
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || "No se pudo escribir en Firestore.");
  }
}

async function getFirestoreDocument(env, documentPath) {
  const accessToken = await getGoogleAccessToken(env);
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const projectId = serviceAccount.project_id || env.FIREBASE_PROJECT_ID;
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || "No se pudo leer Firestore.");
  }

  return response.json();
}

async function getGoogleAccessToken(env) {
  if (cachedGoogleToken?.expiresAt > Date.now() + 60_000) {
    return cachedGoogleToken.value;
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(serviceAccount, {
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error_description || "No se pudo autenticar Firestore.");
  }

  cachedGoogleToken = {
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
    value: payload.access_token,
  };

  return cachedGoogleToken.value;
}

async function signJwt(serviceAccount, claims) {
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function toFirestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("integerValue" in value) {
    return Number(value.integerValue);
  }

  if ("doubleValue" in value) {
    return Number(value.doubleValue);
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("timestampValue" in value) {
    return value.timestampValue;
  }

  if ("nullValue" in value) {
    return null;
  }

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }

  if ("mapValue" in value) {
    return fromFirestoreFields(value.mapValue.fields || {});
  }

  return undefined;
}

function toFirestoreValue(value) {
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }

  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }

  return { stringValue: String(value) };
}

function planEndDate(billingCycle) {
  const date = new Date();
  date.setMonth(date.getMonth() + (billingCycle === "anual" ? 12 : 1));

  return date;
}

function corsHeaders(request, env) {
  const allowedOrigins = String(env.ALLOWED_ORIGINS || env.APP_BASE_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = request.headers.get("Origin") || "";
  const origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] || "*";

  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(body, headers, status = 200) {
  return new Response(JSON.stringify(body), { headers, status });
}

function textFromBase64Url(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64UrlEncode(value) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  return base64UrlToBytes(base64.replace(/\+/g, "-").replace(/\//g, "_")).buffer;
}
