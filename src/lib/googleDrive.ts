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

async function parseDriveResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Google Drive respondio con ${response.status}.`);
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
    await fetch(url, {
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
  parentFolderId: string = "1rgmaezSy8mEwkYi0RTqHSne1fLue1p6U"
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("fields", "id,name,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    }),
  });

  const data = await parseDriveResponse<{ id: string; name: string; webViewLink?: string }>(response);
  await setDrivePublicPermissionClient(accessToken, data.id);
  return data;
}

export async function setDrivePublicPermissionClient(accessToken: string, fileId: string): Promise<void> {
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

export async function uploadFileToDriveClient(
  accessToken: string,
  fileName: string,
  mimeType: string,
  fileBlob: Blob,
  parentFolderId: string
): Promise<{ id: string; name: string; webViewLink?: string; directUrl: string }> {
  const boundary = `infrabim_upload_${crypto.randomUUID().slice(0, 8)}`;
  const metadata = {
    name: fileName,
    mimeType: mimeType || "application/octet-stream",
    parents: [parentFolderId],
  };

  const arrayBuffer = await fileBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const encoder = new TextEncoder();
  const part1 = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\nContent-Transfer-Encoding: binary\r\n\r\n`
  );
  const part2 = encoder.encode(`\r\n--${boundary}--`);

  const fullBody = new Uint8Array(part1.length + bytes.length + part2.length);
  fullBody.set(part1, 0);
  fullBody.set(bytes, part1.length);
  fullBody.set(part2, part1.length + bytes.length);

  const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: fullBody,
  });

  const data = await parseDriveResponse<{ id: string; name: string; webViewLink?: string }>(response);
  await setDrivePublicPermissionClient(accessToken, data.id);

  const paymentsApiUrl = import.meta.env.VITE_PAYMENTS_API_URL || "https://infrabim-payments.infrabimss.workers.dev";
  const isBinaryOrGlb = fileName.endsWith(".glb") || fileName.endsWith(".gltf") || mimeType.includes("gltf") || mimeType.includes("octet");
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
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }),
  );
}
