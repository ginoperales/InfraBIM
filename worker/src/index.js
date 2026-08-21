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

const MIN_YAPE_PAYMENT_AMOUNT_PEN = 5;

let cachedGoogleToken = null;
let cachedJwks = null;

export default {
  async fetch(request, env) {
    // Always compute CORS headers first so they are included in every response,
    // including preflight, error 4xx/5xx and unexpected throws.
    const headers = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers, status: 204 });
    }

    const url = new URL(request.url);

    // Webhook IPN route — process any method/ping immediately and respond 200 OK
    if (url.pathname === "/mercado-pago-webhook") {
      return await mercadoPagoWebhook(request, env, headers);
    }

    // Health check — useful to diagnose connectivity from localhost
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json(
        {
          ok: true,
          service: "InfraBIM payments worker",
          configOk: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN && env.FIREBASE_SERVICE_ACCOUNT && env.FIREBASE_PROJECT_ID),
        },
        headers,
      );
    }

    if (request.method === "GET" && url.pathname === "/mercado-pago-health") {
      return await mercadoPagoCredentialsHealth(env, headers);
    }

    // Guard: if secrets are missing return 503 (not 500) so the frontend
    // can show a clearer message instead of a generic CORS/network error.
    if (!env.MERCADO_PAGO_ACCESS_TOKEN || !env.FIREBASE_SERVICE_ACCOUNT || !env.FIREBASE_PROJECT_ID) {
      return json(
        {
          message:
            "El Worker de pagos no está configurado. Agrega MERCADO_PAGO_ACCESS_TOKEN, FIREBASE_SERVICE_ACCOUNT y FIREBASE_PROJECT_ID en Cloudflare.",
          code: "WORKER_NOT_CONFIGURED",
        },
        headers,
        503,
      );
    }

    try {
      if (request.method === "POST" && url.pathname === "/create-card-subscription") {
        return await createCardSubscription(request, env, headers);
      }

      if (request.method === "POST" && url.pathname === "/create-yape-payment") {
        return await createYapePayment(request, env, headers);
      }

      if (request.method === "POST" && url.pathname === "/upload-resource-drive-files") {
        return await uploadResourceDriveFiles(request, env, headers);
      }

      if (request.method === "GET" && (url.pathname.startsWith("/drive-file/") || url.pathname === "/drive-file")) {
        return await serveDriveFile(request, env, headers);
      }

      return json({ message: "Ruta no encontrada." }, headers, 404);
    } catch (error) {
      // IMPORTANT: the catch block MUST use the pre-computed `headers` so that
      // even error responses carry the Access-Control-Allow-Origin header.
      const message = error instanceof Error ? error.message : "No se pudo procesar la solicitud.";
      const status =
        error instanceof Error && typeof error.status === "number" && error.status >= 400 && error.status < 600
          ? error.status
          : 400;
      return json({ message }, headers, status);
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

  const externalReference = buildExternalReference(user.uid, planId, billingCycle);
  const idempotencyKey = crypto.randomUUID();
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
      notification_url: mercadoPagoWebhookUrl(request),
      payer_email: email,
      reason: `InfraBIM ${plan.label}`,
      status: "authorized",
    },
    env,
    { idempotencyKey },
  );

  await savePaymentRecord(env, "subscriptions", response.id, {
    amount,
    billingCycle,
    createdAt: new Date(),
    externalReference,
    idempotencyKey,
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
    mercadoPagoStatus: response.status || "pending",
    method: "card",
    planId,
    status: normalizeSubscriptionStatus(response.status),
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

  validateYapeAmount(amount);

  const externalReference = buildExternalReference(user.uid, planId, billingCycle);
  const idempotencyKey = crypto.randomUUID();
  const response = await mercadoPagoRequest(
    "/v1/payments",
    {
      description: `InfraBIM ${plan.label} ${billingCycle}`,
      external_reference: externalReference,
      installments: 1,
      notification_url: mercadoPagoWebhookUrl(request),
      payer: {
        email,
      },
      payment_method_id: "yape",
      token: yapeToken,
      transaction_amount: normalizeMercadoPagoAmount(amount),
    },
    env,
    { idempotencyKey },
  );
  const approved = response.status === "approved";

  await savePaymentRecord(env, "payments", response.id, {
    amount,
    billingCycle,
    createdAt: new Date(),
    externalReference,
    idempotencyKey,
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
      mercadoPagoStatus: response.status,
      method: "yape",
      planId,
      status: "active",
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
  const url = new URL(request.url);
  let body = {};

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json().catch(() => ({}));
    } else if (contentType.includes("form")) {
      const text = await request.text().catch(() => "");
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (err) {
    body = {};
  }

  const eventId = crypto.randomUUID();
  const queryParams = Object.fromEntries(url.searchParams.entries());

  if (env.MERCADO_PAGO_ACCESS_TOKEN && env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      await savePaymentRecord(env, "paymentWebhookEvents", eventId, {
        body,
        createdAt: new Date(),
        query: queryParams,
        source: "mercado_pago",
      });
    } catch (err) {
      console.warn("Could not save webhook log event:", err);
    }
  }

  const resourceId = body?.data?.id || url.searchParams.get("id") || body?.id;
  const type = body?.type || url.searchParams.get("topic") || url.searchParams.get("type") || body?.topic;

  if (resourceId && type && env.MERCADO_PAGO_ACCESS_TOKEN && env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      await refreshMercadoPagoResource(env, String(type), String(resourceId));
    } catch (err) {
      console.warn(`Resource lookup skipped/failed for ${type} ${resourceId}:`, err);
    }
  }

  return json({ ok: true, received: true }, headers, 200);
}

async function refreshMercadoPagoResource(env, type, resourceId) {
  const normalizedType = String(type || "").toLowerCase();

  if (normalizedType.includes("authorized_payment")) {
    const authorizedPayment = await mercadoPagoGet(`/authorized_payments/${resourceId}`, env);
    await savePaymentRecord(env, "subscriptionAuthorizedPayments", authorizedPayment.id, {
      mercadoPagoId: authorizedPayment.id,
      preapprovalId: authorizedPayment.preapproval_id || "",
      status: authorizedPayment.status || "pending",
      statusDetail: authorizedPayment.status_detail || "",
      updatedAt: new Date(),
    });
    return;
  }

  if (normalizedType.includes("payment")) {
    const payment = await mercadoPagoGet(`/v1/payments/${resourceId}`, env);
    const reference = parseExternalReference(payment.external_reference);
    const patch = {
      amount: Number(payment.transaction_amount || 0),
      externalReference: payment.external_reference || "",
      mercadoPagoId: payment.id,
      status: payment.status || "pending",
      statusDetail: payment.status_detail || "",
      updatedAt: new Date(),
    };

    if (reference) {
      Object.assign(patch, {
        billingCycle: reference.billingCycle,
        ownerUid: reference.uid,
        paymentMethodId: payment.payment_method_id || payment.payment_type_id || "payment",
        planId: reference.planId,
      });
    }

    await savePaymentRecord(env, "payments", payment.id, patch);

    if (reference && payment.status === "approved") {
      await updateUserPlan(env, reference.uid, {
        billingCycle: reference.billingCycle,
        expiresAt: planEndDate(reference.billingCycle),
        lastPaymentId: payment.id,
        mercadoPagoId: payment.id,
        mercadoPagoStatus: payment.status,
        method: payment.payment_method_id || "payment",
        planId: reference.planId,
        status: "active",
        updatedAt: new Date(),
      });
    }
    return;
  }

  if (normalizedType.includes("preapproval") || normalizedType.includes("subscription")) {
    const subscription = await mercadoPagoGet(`/preapproval/${resourceId}`, env);
    const reference = parseExternalReference(subscription.external_reference);
    const patch = {
      amount: Number(subscription.auto_recurring?.transaction_amount || 0),
      externalReference: subscription.external_reference || "",
      mercadoPagoId: subscription.id,
      status: subscription.status || "pending",
      updatedAt: new Date(),
    };

    if (reference) {
      Object.assign(patch, {
        billingCycle: reference.billingCycle,
        ownerEmail: subscription.payer_email || "",
        ownerUid: reference.uid,
        paymentMethodId: subscription.payment_method_id || "card",
        planId: reference.planId,
      });
    }

    await savePaymentRecord(env, "subscriptions", subscription.id, patch);

    if (reference) {
      await updateUserPlan(env, reference.uid, {
        billingCycle: reference.billingCycle,
        expiresAt: String(subscription.status || "").toLowerCase() === "authorized" ? null : new Date(),
        mercadoPagoId: subscription.id,
        mercadoPagoStatus: subscription.status || "pending",
        method: "card",
        planId: reference.planId,
        status: normalizeSubscriptionStatus(subscription.status),
        updatedAt: new Date(),
      });
    }
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

  return { amount: normalizeMercadoPagoAmount(amount), plan };
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

function normalizeMercadoPagoAmount(amount) {
  return Number(Number(amount).toFixed(2));
}

function validateYapeAmount(amount) {
  if (!Number.isFinite(amount) || amount < MIN_YAPE_PAYMENT_AMOUNT_PEN) {
    const err = new Error(
      "Yape en produccion esta rechazando este monto. Configura el plan con minimo S/ " + MIN_YAPE_PAYMENT_AMOUNT_PEN + ".",
    );
    err.status = 400;
    err.code = "YAPE_AMOUNT_TOO_LOW";
    throw err;
  }
}

function cleanEmail(email, fallback) {
  const value = String(email || fallback || "").trim().toLowerCase();

  if (!value.includes("@")) {
    throw new Error("Mercado Pago requiere un correo de pagador.");
  }

  return value;
}

async function mercadoPagoRequest(path, body, env, options = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": options.idempotencyKey || crypto.randomUUID(),
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const cause = Array.isArray(payload.cause) ? payload.cause[0] : null;
    const detail =
      payload.message ||
      cause?.description ||
      payload.error ||
      "Mercado Pago rechazo la operacion.";
    const code = String(cause?.code || payload.code || "");
    const message =
      code === "2072" || code === "4037" || String(detail).toLowerCase().includes("transaction_amount")
        ? "Mercado Pago rechazo el monto enviado para Yape. Revisa que el plan tenga un importe real compatible."
        : "Mercado Pago: " + detail;
    const err = new Error(message);
    err.status = response.status >= 400 && response.status < 600 ? response.status : 400;
    err.code = code || payload.error || "MERCADO_PAGO_ERROR";
    throw err;
  }

  return payload;
}

function buildExternalReference(uid, planId, billingCycle) {
  return `${uid}:${planId}:${billingCycle}:${Date.now().toString(36)}`;
}

function parseExternalReference(value) {
  const [uid, planId, billingCycle] = String(value || "").split(":");

  if (!uid || !["profesional", "estudiante"].includes(planId) || !["mensual", "anual"].includes(billingCycle)) {
    return null;
  }

  return { billingCycle, planId, uid };
}

function mercadoPagoWebhookUrl(request) {
  const url = new URL(request.url);
  url.pathname = "/mercado-pago-webhook";
  url.search = "";
  return url.toString();
}

function normalizeSubscriptionStatus(status) {
  const normalized = String(status || "pending").toLowerCase();

  if (normalized === "authorized" || normalized === "approved") {
    return "active";
  }

  return normalized;
}

async function mercadoPagoCredentialsHealth(env, headers) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    return json(
      {
        ok: false,
        mercadoPagoOk: false,
        message: "Falta MERCADO_PAGO_ACCESS_TOKEN en Cloudflare Workers.",
      },
      headers,
      503,
    );
  }

  const response = await fetch("https://api.mercadolibre.com/users/me", {
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json(
      {
        ok: false,
        mercadoPagoOk: false,
        status: response.status,
        error: payload.error || payload.message || "invalid_credentials",
      },
      headers,
      200,
    );
  }

  const methodsResponse = await fetch("https://api.mercadopago.com/v1/payment_methods", {
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
    },
  });
  const methodsPayload = await methodsResponse.json().catch(() => []);
  const paymentMethods = Array.isArray(methodsPayload) ? methodsPayload : [];
  const yapeMethod = paymentMethods.find((method) => method?.id === "yape");

  return json(
    {
      ok: true,
      mercadoPagoOk: true,
      countryId: payload.country_id || "",
      siteId: payload.site_id || "",
      userStatus: payload.status?.site_status || payload.status || "active",
      yapeAvailable: Boolean(yapeMethod),
      yapeStatus: yapeMethod?.status || "",
      paymentMethodsOk: methodsResponse.ok,
    },
    headers,
  );
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

const ROOT_DRIVE_FOLDER_ID = "1rgmaezSy8mEwkYi0RTqHSne1fLue1p6U";

async function uploadResourceDriveFiles(request, env, headers) {
  assertEnv(env);
  const user = await getFirebaseUser(request, env);
  const { resourceName, resourceId, images = [], glbFile = null, attachedFiles = [] } = await request.json();

  if (!resourceName) {
    return json({ message: "Nombre del recurso es requerido." }, headers, 400);
  }

  const accessToken = await getGoogleAccessToken(env);
  const cleanName = String(resourceName).trim().replace(/[\\/:*?"<>|]/g, "_");
  const folderSlug = resourceId || crypto.randomUUID().slice(0, 8);
  const folderName = `${cleanName} - ${folderSlug}`;

  // 1. Create dedicated subfolder in Google Drive under root folder (1rgmaezSy8mEwkYi0RTqHSne1fLue1p6U)
  const folder = await createDriveFolder(accessToken, folderName, ROOT_DRIVE_FOLDER_ID);

  const uploadedImages = [];
  let uploadedGlbUrl = "";
  const uploadedFiles = [];

  // 2. Upload cover images to Drive
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img?.base64) {
      const file = await uploadFileToDrive(
        accessToken,
        img.name || `portada_${i + 1}.png`,
        img.mimeType || "image/png",
        img.base64,
        folder.id
      );
      uploadedImages.push(file.directUrl);
    }
  }

  // 3. Upload 3D GLB model to Drive
  if (glbFile && glbFile.base64) {
    const glbResult = await uploadFileToDrive(
      accessToken,
      glbFile.name || "modelo_3d.glb",
      glbFile.mimeType || "model/gltf-binary",
      glbFile.base64,
      folder.id
    );
    uploadedGlbUrl = glbResult.directUrl;
  }

  // 4. Upload attached BIM files to Drive
  for (const file of attachedFiles) {
    if (file?.base64) {
      const result = await uploadFileToDrive(
        accessToken,
        file.name || "archivo_recurso",
        file.mimeType || "application/octet-stream",
        file.base64,
        folder.id
      );
      uploadedFiles.push({
        id: result.id,
        name: result.name,
        mimeType: result.mimeType,
        size: result.size,
        webViewLink: result.webViewLink,
        webContentLink: result.webContentLink,
        directUrl: result.directUrl,
      });
    }
  }

  return json(
    {
      ok: true,
      driveFolderId: folder.id,
      driveFolderLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
      images: uploadedImages,
      glbUrl: uploadedGlbUrl,
      attachedFiles: uploadedFiles,
      storageProvider: "google_drive",
    },
    headers
  );
}

async function createDriveFolder(accessToken, name, parentFolderId = ROOT_DRIVE_FOLDER_ID) {
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentFolderId],
  };

  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();

  if (!response.ok) {
    if (data.error?.message?.includes("File not found") || data.error?.code === 404) {
      throw new Error(
        `La carpeta raíz de Drive (${parentFolderId}) aún no ha sido compartida. Abre la carpeta en Google Drive y compártela con firebase-adminsdk-fbsvc@infrabimss.iam.gserviceaccount.com como Editor.`
      );
    }
    if (data.error?.message?.includes("storage quota")) {
      throw new Error(
        `Debes compartir la carpeta de Drive (${parentFolderId}) con firebase-adminsdk-fbsvc@infrabimss.iam.gserviceaccount.com como Editor para consumir la cuota de tu cuenta.`
      );
    }
    throw new Error(data.error?.message || "No se pudo crear la subcarpeta en Google Drive.");
  }

  await setDrivePublicPermission(accessToken, data.id);
  return data;
}

async function setDrivePublicPermission(accessToken, fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone",
    }),
  }).catch(() => null);
}

async function uploadFileToDrive(accessToken, fileName, mimeType, base64Content, parentFolderId) {
  const boundary = `infrabim_upload_${crypto.randomUUID().slice(0, 8)}`;
  const metadata = {
    name: fileName,
    mimeType: mimeType || "application/octet-stream",
    parents: [parentFolderId],
  };

  const cleanBase64 = String(base64Content).replace(/^data:[^;]+;base64,/, "");
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const encoder = new TextEncoder();
  const part1 = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\nContent-Transfer-Encoding: binary\r\n\r\n`
  );
  const part2 = encoder.encode(`\r\n--${boundary}--`);

  const fullBody = new Uint8Array(part1.length + bytes.length + part2.length);
  fullBody.set(part1, 0);
  fullBody.set(bytes, part1.length);
  fullBody.set(part2, part1.length + bytes.length);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: fullBody,
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Error al subir ${fileName} a Google Drive.`);
  }

  await setDrivePublicPermission(accessToken, data.id);
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: data.size,
    webViewLink: data.webViewLink,
    webContentLink: data.webContentLink || `https://drive.google.com/uc?export=download&id=${data.id}`,
    directUrl: `https://lh3.googleusercontent.com/d/${data.id}`,
  };
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
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/devstorage.full_control",
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
    throw new Error(payload.error_description || "No se pudo autenticar Google Services.");
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
  const isLocalhost =
    requestOrigin.startsWith("http://localhost:") ||
    requestOrigin.startsWith("http://127.0.0.1:");
  const origin =
    allowedOrigins.includes(requestOrigin) || isLocalhost
      ? requestOrigin
      : allowedOrigins[0] || "*";

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

async function serveDriveFile(request, env, headers) {
  const url = new URL(request.url);
  const fileId =
    url.pathname.replace("/drive-file/", "").replace("/drive-file", "").trim() ||
    url.searchParams.get("id");

  if (!fileId) {
    return json({ message: "ID de archivo de Drive no proporcionado." }, headers, 400);
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!driveRes.ok) {
      const errorText = await driveRes.text();
      return json(
        { message: "No se pudo obtener el archivo de Google Drive.", details: errorText },
        headers,
        driveRes.status
      );
    }

    const contentType = driveRes.headers.get("content-type") || "application/octet-stream";
    const fileBuffer = await driveRes.arrayBuffer();

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type":
          contentType.includes("json") || contentType.includes("html") || contentType === "application/octet-stream"
            ? "model/gltf-binary"
            : contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al descargar recurso de Drive.";
    return json({ message }, headers, 500);
  }
}

