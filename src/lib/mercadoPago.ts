import { auth } from "./firebase";

export type PaidPlanId = "profesional" | "estudiante";
export type BillingCycle = "mensual" | "anual";

type MercadoPagoConstructor = new (
  publicKey: string,
  options?: { locale?: string },
) => MercadoPagoInstance;

type MercadoPagoInstance = {
  bricks: () => {
    create: (
      type: "cardPayment",
      containerId: string,
      settings: Record<string, unknown>,
    ) => Promise<{ unmount?: () => void }>;
  };
  yape: (options: { otp: string; phoneNumber: string }) => {
    create: () => Promise<string | { id?: string }>;
  };
};

export type CardFormData = {
  token?: string;
  card_token_id?: string;
  payment_method_id?: string;
  payer?: {
    email?: string;
    identification?: {
      type?: string;
      number?: string;
    };
  };
};

type PaymentResponse = {
  id?: string;
  status?: string;
  statusDetail?: string;
  initPoint?: string;
};

declare global {
  interface Window {
    MercadoPago?: MercadoPagoConstructor;
  }
}

let sdkLoader: Promise<void> | null = null;

function mercadoPagoPublicKey() {
  return import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? "";
}

function paymentsApiBaseUrl() {
  return (import.meta.env.VITE_PAYMENTS_API_URL ?? "").replace(/\/+$/, "");
}

export function isMercadoPagoConfigured() {
  return Boolean(mercadoPagoPublicKey());
}

export function isPaymentsApiConfigured() {
  return Boolean(paymentsApiBaseUrl());
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) {
    return Promise.resolve();
  }

  if (sdkLoader) {
    return sdkLoader;
  }

  sdkLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar MercadoPago.js."));
    document.head.appendChild(script);
  });

  return sdkLoader;
}

async function getMercadoPago() {
  const publicKey = mercadoPagoPublicKey();

  if (!publicKey) {
    throw new Error("Agrega VITE_MERCADO_PAGO_PUBLIC_KEY para activar Mercado Pago.");
  }

  await loadMercadoPagoSdk();

  if (!window.MercadoPago) {
    throw new Error("Mercado Pago no esta disponible en el navegador.");
  }

  return new window.MercadoPago(publicKey, { locale: "es-PE" });
}

export async function mountCardPaymentBrick(options: {
  amount: number;
  containerId: string;
  onSubmit: (formData: CardFormData) => Promise<void>;
  onError: (message: string) => void;
}) {
  const mp = await getMercadoPago();
  const bricksBuilder = mp.bricks();

  const controller = await bricksBuilder.create("cardPayment", options.containerId, {
    initialization: {
      amount: options.amount,
    },
    customization: {
      visual: {
        style: {
          customVariables: {
            baseColor: "#0f6872",
            baseColorFirstVariant: "#0a4d55",
            secondaryColor: "#d96f3d",
          },
          theme: "default",
        },
      },
      paymentMethods: {
        maxInstallments: 1,
      },
    },
    callbacks: {
      onReady: () => undefined,
      onSubmit: async (formData: CardFormData) => {
        await options.onSubmit(formData);
      },
      onError: (error: unknown) => {
        options.onError(error instanceof Error ? error.message : "Mercado Pago rechazo el formulario.");
      },
    },
  });

  return () => controller.unmount?.();
}

export async function createYapeToken(phoneNumber: string, otp: string) {
  const mp = await getMercadoPago();
  const yapeToken = await mp.yape({ otp, phoneNumber }).create();

  if (typeof yapeToken === "string") {
    return yapeToken;
  }

  if (yapeToken.id) {
    return yapeToken.id;
  }

  throw new Error("Mercado Pago no devolvio token de Yape.");
}

async function paymentsRequest<TPayload extends object>(endpoint: string, payload: TPayload) {
  const apiBaseUrl = paymentsApiBaseUrl();

  if (!apiBaseUrl) {
    throw new Error("Configura VITE_PAYMENTS_API_URL con la URL del Worker de Cloudflare.");
  }

  const token = await auth?.currentUser?.getIdToken();

  if (!token) {
    throw new Error("Inicia sesion para procesar pagos.");
  }

  const response = await fetch(`${apiBaseUrl}/${endpoint}`, {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = (await response.json().catch(() => ({}))) as PaymentResponse & { message?: string };

  if (!response.ok) {
    throw new Error(data.message || "No se pudo procesar el pago.");
  }

  return data;
}

export async function createCardSubscription(payload: {
  billingCycle: BillingCycle;
  cardTokenId: string;
  payerEmail: string;
  planId: PaidPlanId;
}) {
  return paymentsRequest("create-card-subscription", payload);
}

export async function createYapePayment(payload: {
  billingCycle: BillingCycle;
  payerEmail: string;
  planId: PaidPlanId;
  yapeToken: string;
}) {
  return paymentsRequest("create-yape-payment", payload);
}
