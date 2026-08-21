const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

export type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
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
        "NET_BLOCKED_BY_CLIENT: La petición a Google Drive fue bloqueada por tu navegador (Microsoft Edge Tracking Prevention) o una extensión (AdBlock / uBlock Origin). Por favor desactiva el AdBlocker para infrabimss.web.app e reintenta."
      );
    }
    throw err;
  }
}

async function parseDriveResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    let cleanMessage = rawText;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.error?.message) {
        cleanMessage = parsed.error.message;
      }
    } catch {}

    if (response.status === 401) {
      throw new Error("401: Token de Google Drive no autorizado o expirado. Vuelve a hacer clic en Autorizar Google Drive.");
    }
    throw new Error(cleanMessage || `Google Drive respondió con ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function listDriveFiles(accessToken: string, folderId?: string): Promise<DriveFile[]> {
  const url = new URL(DRIVE_API);
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,size,webViewLink)");

  if (folderId) {
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
  } else {
    url.searchParams.set("q", "trashed=false");
  }

  const data = await parseDriveResponse<{ files: DriveFile[] }>(
    await safeFetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );

  return data.files;
}

export async function createDriveFolderClient(
  accessToken: string,
  name: string,
  parentFolderId?: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const envRootId = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const targetParent = parentFolderId || envRootId || undefined;

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("fields", "id,name,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");

  const body: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (targetParent) {
    body.parents = [targetParent];
  }

  let response = await safeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok && targetParent && (response.status === 404 || response.status === 403)) {
    console.warn(`Carpeta padre ${targetParent} no accesible (HTTP ${response.status}). Creando carpeta '${name}' en la raíz de Google Drive...`);
    delete body.parents;
    response = await safeFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  const data = await parseDriveResponse<{ id: string; name: string; webViewLink?: string }>(response);
  await setDrivePublicPermissionClient(accessToken, data.id);
  return data;
}

export async function setDrivePublicPermissionClient(accessToken: string, fileId: string): Promise<void> {
  await safeFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
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

export async function uploadFileToDriveClient(
  accessToken: string,
  fileName: string,
  mimeType: string,
  fileBlob: Blob,
  parentFolderId?: string
): Promise<{ id: string; name: string; webViewLink?: string; directUrl: string }> {
  const boundary = `infrabim_upload_${crypto.randomUUID().slice(0, 8)}`;
  const actualMime = getMimeTypeForFile(fileName, mimeType);

  const arrayBuffer = await fileBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const createPayload = (useParent: boolean) => {
    const metadata: any = {
      name: fileName,
      mimeType: actualMime,
    };
    if (useParent && parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const encoder = new TextEncoder();
    const part1 = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${actualMime}\r\nContent-Transfer-Encoding: binary\r\n\r\n`
    );
    const part2 = encoder.encode(`\r\n--${boundary}--`);

    const fullBody = new Uint8Array(part1.length + bytes.length + part2.length);
    fullBody.set(part1, 0);
    fullBody.set(bytes, part1.length);
    fullBody.set(part2, part1.length + bytes.length);
    return fullBody;
  };

  const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink");

  let response = await safeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: createPayload(Boolean(parentFolderId)),
  });

  if (!response.ok && parentFolderId && (response.status === 404 || response.status === 403)) {
    console.warn(`Carpeta destino ${parentFolderId} no accesible. Subiendo archivo '${fileName}' en raíz de Drive...`);
    response = await safeFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: createPayload(false),
    });
  }

  const data = await parseDriveResponse<{ id: string; name: string; webViewLink?: string }>(response);
  await setDrivePublicPermissionClient(accessToken, data.id);

  const paymentsApiUrl = import.meta.env.VITE_PAYMENTS_API_URL || "https://infrabim-payments.infrabimss.workers.dev";
  const isBinaryOrGlb = fileName.endsWith(".glb") || fileName.endsWith(".gltf") || actualMime.includes("gltf") || actualMime.includes("octet");
  const directUrl = isBinaryOrGlb && paymentsApiUrl ? `${paymentsApiUrl}/drive-file/${data.id}` : `https://lh3.googleusercontent.com/d/${data.id}`;
  return {
    ...data,
    directUrl,
  };
}

export async function uploadJsonToDrive(
  accessToken: string,
  name: string,
  payload: unknown,
  folderId?: string,
): Promise<DriveFile> {
  const boundary = `infrabim_${Date.now()}`;
  const metadata = {
    name,
    mimeType: "application/json",
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    JSON.stringify(payload, null, 2),
    `--${boundary}--`,
  ].join("\r\n");

  const url = new URL(DRIVE_UPLOAD_API);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,name,mimeType,modifiedTime,webViewLink");

  return parseDriveResponse<DriveFile>(
    await safeFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }),
  );
}

export async function deleteDriveFileClient(accessToken: string, fileId: string): Promise<void> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set("supportsAllDrives", "true");

  const response = await safeFetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const msg = await response.text().catch(() => "");
    throw new Error(msg || `Failed to delete Drive file ${fileId}`);
  }
}

export async function renameDriveFileClient(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<{ id: string; name: string }> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await safeFetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newName }),
  });

  return parseDriveResponse<{ id: string; name: string }>(response);
}
