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
  const [app, firebase, firestore, drive, envExample] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/firebase.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/firestore.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/googleDrive.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(app, /signInWithPopup/);
  assert.match(firebase, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(firestore, /bimObjects/);
  assert.match(drive, /uploadType", "multipart"/);
  assert.match(envExample, /VITE_FIREBASE_PROJECT_ID=infrabim/);
});
