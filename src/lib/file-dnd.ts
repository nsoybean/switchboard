export const SWITCHBOARD_FILE_DRAG_TYPE = "application/x-switchboard-file-path";

export function getSwitchboardFileDragPath(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null;

  const types = Array.from(dataTransfer.types ?? []);
  if (!types.includes(SWITCHBOARD_FILE_DRAG_TYPE)) return null;

  const value = dataTransfer.getData(SWITCHBOARD_FILE_DRAG_TYPE);
  return value || null;
}
