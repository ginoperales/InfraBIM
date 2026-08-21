const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const DEFAULT_DRIVE_ROOT_FOLDER_ID = "1rgmaezSy8mEwkYi0RTqHSne1fLue1p6U";

export type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

export type DriveTreeFile = DriveFile & {
  path: string;
};

export type DriveUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type DriveUploadOptions = {
  onProgress?: (progress: DriveUploadProgress) => void;
};

export function getMimeTypeForFile(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType !== "application/octet-stream" && mimeType !== "") {
    return mimeType;
  }
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".rfa": "application/octet-stream",
    ".rvt": "application/octet-stream",
    ".ifc": "application/x-step",
    ".dwg": "image/vnd.dwg",
    ".skp": "application/octet-stream",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  return map[ext] || mimeType || "application/octet-stream";
}

async function safeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err: any) {
    if (err.name === "TypeError" || err.message?.includes("Failed to fetch")) {
      throw new Error(
        "NET_BLOCKED_BY_CLIENT: La peticion a Google Drive fue bloqueada por tu navegador (Microsoft Edge Tracking Prevention) o una extension (AdBlock / uBlock Origin). Desactiva el bloqueo para infrabimss.web.app y reintenta."
      );
    }
    throw err;
  }
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseDriveErrorMessage(status: number, rawText: string): string {
  let cleanMessage = rawText;
  try {
    const parsed = JSON.parse(rawText);
    if (parsed.error?.message) {
      cleanMessage = parsed.error.message;
    }
  } catch {}

  if (status === 401) {
    return "401: Token de Google Drive no autorizado o expirado. Vuelve a hacer clic en Autorizar Google Drive.";
  }

  if (status === 403 || status === 404) {
    return String(status) + ": No se pudo acceder a la carpeta destino de Google Drive. Verifica que la cuenta tenga permiso de editor sobre la carpeta raiz configurada.";
  }

  return cleanMessage || "Google Drive respondio con " + String(status) + ".";
}

async function parseDriveResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    throw new Error(parseDriveErrorMessage(response.status, rawText));
  }

  return response.json() as Promise<T>;
}

function buildDriveDirectUrl(fileName: string, mimeType: string, fileId: string): string {
  const paymentsApiUrl = import.meta.env.VITE_PAYMENTS_API_URL || "https://infrabim-payments.infrabimss.workers.dev";
  const isBinaryOrGlb = fileName.endsWith(".glb") || fileName.endsWith(".gltf") || mimeType.includes("gltf") || mimeType.includes("octet");
  return isBinaryOrGlb && paymentsApiUrl ? paymentsApiUrl + "/drive-file/" + fileId : "https://lh3.googleusercontent.com/d/" + fileId;
}

async function createResumableUploadSession(
  accessToken: string,
  metadata: Record<string, unknown>,
  mimeType: string,
  size: number
): Promise<string> {
  const url = new URL(DRIVE_UPLOAD_API);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink");

  const response = await safeFetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    await parseDriveResponse<never>(response);
  }

  const sessionUrl = response.headers.get("Location");
  if (!sessionUrl) {
    throw new Error("Google Drive no devolvio URL de subida resumable.");
  }
  return sessionUrl;
}

function uploadBlobToResumableSession(
  sessionUrl: string,
  fileBlob: Blob,
  mimeType: string,
  options?: DriveUploadOptions
): Promise<{ id: string; name: string; webViewLink?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sessionUrl);
    xhr.setRequestHeader("Content-Type", mimeType);

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : fileBlob.size;
      const loaded = event.lengthComputable ? event.loaded : Math.min(fileBlob.size, total);
      options?.onProgress?.({
        loaded,
        total: total || fileBlob.size || 1,
        percent: Math.min(99, Math.round((loaded / (total || fileBlob.size || 1)) * 100)),
      });
    };

    xhr.onload = () => {
      const rawText = xhr.responseText || "";
      if (xhr.status >= 200 && xhr.status < 300) {
        options?.onProgress?.({ loaded: fileBlob.size, total: fileBlob.size || 1, percent: 100 });
        try {
          resolve(JSON.parse(rawText) as { id: string; name: string; webViewLink?: string });
        } catch {
          reject(new Error("Google Drive completo la subida, pero la respuesta no pudo leerse."));
        }
        return;
      }

      reject(new Error(parseDriveErrorMessage(xhr.status, rawText)));
    };

    xhr.onerror = () => {
      reject(new Error("NET_BLOCKED_BY_CLIENT: El navegador bloqueo la subida a Google Drive. Revisa extensiones, proteccion contra rastreo o permisos del sitio."));
    };
    xhr.onabort = () => reject(new Error("La subida a Google Drive fue cancelada."));
    xhr.ontimeout = () => reject(new Error("La subida a Google Drive tardo demasiado y fue cancelada por el navegador."));

    xhr.send(fileBlob);
  });
}

export async function listDriveFiles(accessToken: string, folderId?: string): Promise<DriveFile[]> {
  const url = new URL(DRIVE_API);
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,size,webViewLink)");

  if (folderId) {
    url.searchParams.set("q", "'" + folderId + "' in parents and trashed=false");
  } else {
    url.searchParams.set("q", "trashed=false");
  }

  const data = await parseDriveResponse<{ files: DriveFile[] }>(
    await safeFetch(url, {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
    }),
  );

  return data.files;
}

export async function findDriveFolderClient(
  accessToken: string,
  name: string,
  parentFolderId?: string
): Promise<{ id: string; name: string; webViewLink?: string } | null> {
  const url = new URL(DRIVE_API);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("fields", "files(id,name,webViewLink)");
  const queryParts = [
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    "name='" + escapeDriveQueryValue(name) + "'",
  ];
  if (parentFolderId) {
    queryParts.push("'" + parentFolderId + "' in parents");
  }
  url.searchParams.set("q", queryParts.join(" and "));

  const data = await parseDriveResponse<{ files: Array<{ id: string; name: string; webViewLink?: string }> }>(
    await safeFetch(url, {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
    }),
  );

  return data.files[0] || null;
}

export async function createDriveFolderClient(
  accessToken: string,
  name: string,
  parentFolderId?: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const envRootId = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID || DEFAULT_DRIVE_ROOT_FOLDER_ID;
  const targetParent = parentFolderId || envRootId || undefined;

  const url = new URL(DRIVE_API);
  url.searchParams.set("fields", "id,name,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");

  const body: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (targetParent) {
    body.parents = [targetParent];
  }

  const response = await safeFetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await parseDriveResponse<{ id: string; name: string; webViewLink?: string }>(response);
  await setDrivePublicPermissionClient(accessToken, data.id);
  return data;
}

export async function getOrCreateDriveFolderClient(
  accessToken: string,
  name: string,
  parentFolderId?: string
): Promise<{ id: string; name: string; webViewLink?: string; reused: boolean }> {
  const existing = await findDriveFolderClient(accessToken, name, parentFolderId);
  if (existing) {
    return { ...existing, reused: true };
  }

  const created = await createDriveFolderClient(accessToken, name, parentFolderId);
  return { ...created, reused: false };
}

export async function setDrivePublicPermissionClient(accessToken: string, fileId: string): Promise<void> {
  await safeFetch("https://www.googleapis.com/drive/v3/files/" + fileId + "/permissions?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone",
    }),
  }).catch(() => null);
}

export async function uploadFileToDriveClient(
  accessToken: string,
  fileName: string,
  mimeType: string,
  fileBlob: Blob,
  parentFolderId?: string,
  options?: DriveUploadOptions
): Promise<{ id: string; name: string; webViewLink?: string; directUrl: string }> {
  const actualMime = getMimeTypeForFile(fileName, mimeType);
  const metadata: any = {
    name: fileName,
    mimeType: actualMime,
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const sessionUrl = await createResumableUploadSession(accessToken, metadata, actualMime, fileBlob.size || 0);
  const data = await uploadBlobToResumableSession(sessionUrl, fileBlob, actualMime, options);
  await setDrivePublicPermissionClient(accessToken, data.id);

  return {
    ...data,
    directUrl: buildDriveDirectUrl(fileName, actualMime, data.id),
  };
}

export async function uploadJsonToDrive(
  accessToken: string,
  name: string,
  payload: unknown,
  folderId?: string,
): Promise<DriveFile> {
  const boundary = "infrabim_" + Date.now();
  const metadata = {
    name,
    mimeType: "application/json",
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const body = [
    "--" + boundary,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    "--" + boundary,
    "Content-Type: application/json",
    "",
    JSON.stringify(payload, null, 2),
    "--" + boundary + "--",
  ].join("\r\n");

  const url = new URL(DRIVE_UPLOAD_API);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,mimeType,modifiedTime,webViewLink");

  return parseDriveResponse<DriveFile>(
    await safeFetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "multipart/related; boundary=" + boundary,
      },
      body,
    }),
  );
}

async function listDriveChildren(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken = "";

  do {
    const url = new URL(DRIVE_API);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)");
    url.searchParams.set("q", "'" + folderId + "' in parents and trashed=false");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const data = await parseDriveResponse<{ nextPageToken?: string; files: DriveFile[] }>(
      await safeFetch(url, {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
      }),
    );
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return allFiles;
}

export async function listDriveFolderFilesRecursiveClient(
  accessToken: string,
  folderId: string,
  basePath = ""
): Promise<DriveTreeFile[]> {
  const children = await listDriveChildren(accessToken, folderId);
  const results: DriveTreeFile[] = [];

  for (const child of children) {
    const childPath = basePath ? basePath + "/" + child.name : child.name;
    if (child.mimeType === "application/vnd.google-apps.folder") {
      results.push(...(await listDriveFolderFilesRecursiveClient(accessToken, child.id, childPath)));
    } else {
      results.push({ ...child, path: childPath });
    }
  }

  return results;
}

export async function downloadDriveFileBlobClient(accessToken: string, fileId: string): Promise<Blob> {
  const url = new URL(DRIVE_API + "/" + fileId);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await safeFetch(url, {
    headers: {
      Authorization: "Bearer " + accessToken,
    },
  });

  if (!response.ok) {
    await parseDriveResponse<never>(response);
  }

  return response.blob();
}

export async function deleteDriveFileClient(accessToken: string, fileId: string): Promise<void> {
  const url = new URL(DRIVE_API + "/" + fileId);
  url.searchParams.set("supportsAllDrives", "true");

  const response = await safeFetch(url, {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + accessToken,
    },
  });

  if (!response.ok && response.status !== 404) {
    const msg = await response.text().catch(() => "");
    throw new Error(msg || "Failed to delete Drive file " + fileId);
  }
}

export async function renameDriveFileClient(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<{ id: string; name: string }> {
  const url = new URL(DRIVE_API + "/" + fileId);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await safeFetch(url, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newName }),
  });

  return parseDriveResponse<{ id: string; name: string }>(response);
}
