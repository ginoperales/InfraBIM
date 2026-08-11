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
