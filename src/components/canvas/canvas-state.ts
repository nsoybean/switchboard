// Canvas tile data model. Pure data, no DOM.

export type TileType = "terminal" | "label";

export interface CanvasTile {
  id: string;
  type: TileType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  /** Terminal tiles: session ID */
  sessionId?: string;
  /** Label tiles: display text */
  text?: string;
  /** Label tiles: font size in px */
  fontSize?: number;
}

export interface CanvasViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CanvasState {
  version: 1;
  tiles: CanvasTile[];
  viewport: CanvasViewport;
}

export const CELL = 20;
export const MAJOR = 80;

export const MIN_SIZES: Record<TileType, { width: number; height: number }> = {
  terminal: { width: 300, height: 200 },
  label: { width: 100, height: 40 },
};

export const DEFAULT_SIZES: Record<
  TileType,
  { width: number; height: number }
> = {
  terminal: { width: 480, height: 400 },
  label: { width: 200, height: 40 },
};

let idCounter = 0;

export function generateTileId(): string {
  idCounter++;
  return `tile-${Date.now()}-${idCounter}`;
}

export function nextZIndex(tiles: CanvasTile[]): number {
  if (tiles.length === 0) return 1;
  return Math.max(...tiles.map((t) => t.zIndex)) + 1;
}

export function snapToGrid(tile: CanvasTile): void {
  tile.x = Math.round(tile.x / CELL) * CELL;
  tile.y = Math.round(tile.y / CELL) * CELL;
  tile.width = Math.round(tile.width / CELL) * CELL;
  tile.height = Math.round(tile.height / CELL) * CELL;
}

export function defaultCanvasState(): CanvasState {
  return {
    version: 1,
    tiles: [],
    viewport: { panX: 0, panY: 0, zoom: 1.0 },
  };
}
