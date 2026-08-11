# InfraBIM Hub

Prototipo web de InfraBIM conectado a Firebase Hosting, Firebase Auth, Cloud
Firestore y Google Drive API.

## Stack

- React + Vite + TypeScript
- Firebase Hosting para publicar `dist/`
- Firebase Auth con Google provider
- Firestore para usuarios, objetos BIM, favoritos y registros de Drive
- Google Drive API como almacenamiento de fichas/archivos BIM

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

## Comandos

```bash
npm install
npm run dev
npm run build
npm test
npm run deploy
```

## Deploy

El deploy usa:

```bash
firebase deploy --only hosting,firestore:rules
```

El proyecto Firebase configurado por defecto es `infrabimss` en `.firebaserc`.
Si tu Project ID real es diferente, actualiza ese archivo antes de desplegar.

## GitHub

El remoto esperado es:

```bash
https://github.com/ginoperales/InfraBIM.git
```
