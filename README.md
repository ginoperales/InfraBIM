# InfraBIM Hub

Prototipo web de InfraBIM conectado a Firebase Hosting, Firebase Auth, Cloud
Firestore y Google Drive API.

## Stack

- React + Vite + TypeScript
- Firebase Hosting para publicar `dist/`
- Firebase Auth con Google provider
- Firestore para usuarios, objetos BIM, favoritos y registros de Drive
- Google Drive API como almacenamiento de fichas/archivos BIM
- Cloudflare Workers Free como backend seguro de Mercado Pago
- Mercado Pago para suscripciones con tarjeta y pagos Yape dentro de InfraBIM

## Configuracion

1. Copia `.env.example` a `.env.local`.
2. Completa las variables `VITE_FIREBASE_*` con la configuracion web de tu app
   Firebase.
3. Si quieres guardar archivos dentro de una carpeta especifica de Drive, agrega
   su ID en `VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID`.
4. En Firebase Console habilita Authentication con Google.
5. En Google Cloud habilita Google Drive API para el mismo proyecto.
6. Agrega tus dominios autorizados en Firebase Auth y en el cliente OAuth de
   Google.
7. En Mercado Pago Developers copia tu Public Key de Peru en
   `VITE_MERCADO_PAGO_PUBLIC_KEY`.
8. Cuando despliegues el Worker, coloca su URL en `VITE_PAYMENTS_API_URL`.

## Pagos con Cloudflare Workers

El Access Token de Mercado Pago nunca va en React. Guardalo como secreto del
Worker:

```bash
npx wrangler login
npm run worker:secret:mp
```

Para que el Worker escriba pagos y suscripciones en Firestore, crea una service
account de Firebase y guardala como secreto JSON:

```bash
npm run worker:secret:firebase
```

Despliegue del Worker:

```bash
npm run worker:deploy
```

Despues del deploy, copia la URL `workers.dev` en `.env.local`:

```bash
VITE_PAYMENTS_API_URL=https://infrabim-payments.<tu-subdominio>.workers.dev
```

Nunca coloques `MERCADO_PAGO_ACCESS_TOKEN` ni `FIREBASE_SERVICE_ACCOUNT` en
`.env.local`; solo deben estar en Cloudflare Secrets.

## Comandos

```bash
npm install
npm run dev
npm run build
npm test
npm run deploy
```

## Deploy

Hosting y reglas:

```bash
firebase deploy --only hosting,firestore:rules
```

Funciones de pago:

```bash
npm run worker:deploy
```

El proyecto Firebase configurado por defecto es `infrabimss` en `.firebaserc`.
Si tu Project ID real es diferente, actualiza ese archivo antes de desplegar.

## GitHub

El remoto esperado es:

```bash
https://github.com/ginoperales/InfraBIM.git
```
