import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds a Firebase Hosting compatible SPA", async () => {
  const [html, firebaseConfig, distFiles] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../firebase.json", import.meta.url), "utf8"),
    readdir(new URL("../dist/assets/", import.meta.url)),
  ]);

  assert.match(html, /<title>InfraBIM Hub<\/title>/);
  assert.match(html, /type="module"/);
  assert.match(firebaseConfig, /"public": "dist"/);
  assert.match(firebaseConfig, /"destination": "\/index.html"/);
  assert.ok(distFiles.some((file) => file.endsWith(".js")));
  assert.ok(distFiles.some((file) => file.endsWith(".css")));
});

test("keeps Firebase and Drive integration source in the client app", async () => {
  const [app, firebase, firestore, drive, mercadoPago, worker, wrangler, envExample] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/firebase.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/firestore.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/googleDrive.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/mercadoPago.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/src/index.js", import.meta.url), "utf8"),
    readFile(new URL("../worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(app, /signInWithPopup/);
  assert.match(app, /goToAdmin/);
  assert.match(app, /route === "\/admin"/);
  assert.match(app, /route === "\/planes"/);
  assert.match(app, /catalogItems/);
  assert.match(app, /\/familias\/\$\{slug\}/);
  assert.match(app, /lucide-react/);
  assert.match(app, /admin-route/);
  assert.match(app, /Panel administrador/);
  assert.match(app, /Permisos por rol/);
  assert.match(app, /Tambien te puede gustar/);
  assert.match(app, /getSimilarProducts/);
  assert.match(app, /renderPlansPage/);
  assert.match(app, /Los mejores proyectos empiezan aqui/);
  assert.match(app, /billingCycle/);
  assert.match(app, /Mercado Pago/);
  assert.match(app, /Pagar con Yape/);
  assert.match(firebase, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(firestore, /initializeUserAccess/);
  assert.match(firestore, /saveCatalogItem/);
  assert.match(firestore, /catalogItems/);
  assert.match(firestore, /system", "accessControl"/);
  assert.match(firestore, /Administrador/);
  assert.match(firestore, /bimObjects/);
  assert.match(drive, /uploadType", "multipart"/);
  assert.match(mercadoPago, /sdk\.mercadopago\.com\/js\/v2/);
  assert.match(mercadoPago, /createCardSubscription/);
  assert.match(mercadoPago, /createYapePayment/);
  assert.match(mercadoPago, /VITE_PAYMENTS_API_URL/);
  assert.match(worker, /MERCADO_PAGO_ACCESS_TOKEN/);
  assert.match(worker, /FIREBASE_SERVICE_ACCOUNT/);
  assert.match(worker, /\/preapproval/);
  assert.match(worker, /payment_method_id: "yape"/);
  assert.match(worker, /verifyFirebaseToken/);
  assert.match(wrangler, /infrabim-payments/);
  assert.match(envExample, /VITE_FIREBASE_PROJECT_ID=infrabim/);
  assert.match(envExample, /VITE_MERCADO_PAGO_PUBLIC_KEY=/);
  assert.match(envExample, /VITE_PAYMENTS_API_URL=/);
});
