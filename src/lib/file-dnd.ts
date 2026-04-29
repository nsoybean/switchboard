export const SWITCHBOARD_FILE_DRAG_TYPE = "application/x-switchboard-file-path";

export function getSwitchboardFileDragPath(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null;

  const types = Array.from(dataTransfer.types ?? []);
  if (!types.includes(SWITCHBOARD_FILE_DRAG_TYPE)) return null;

  const value = dataTransfer.getData(SWITCHBOARD_FILE_DRAG_TYPE);
  return value || null;
}

function fileUriToPath(uri: string): string | null {
  try {
    const url = new URL(uri.trim());
    if (url.protocol !== "file:") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

export function getDroppedFilePath(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null;

  const switchboardPath = getSwitchboardFileDragPath(dataTransfer);
  if (switchboardPath) return switchboardPath;

  const files = Array.from(dataTransfer.files ?? []);
  for (const file of files) {
    const path = (file as File & { path?: string }).path;
    if (path) return path;
  }

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const path = fileUriToPath(line);
      if (path) return path;
    }
  }

  const plain = dataTransfer.getData("text/plain");
  if (plain.startsWith("file://")) {
    return fileUriToPath(plain);
  }
  if (plain.startsWith("/")) {
    return plain;
  }

  return null;
}
