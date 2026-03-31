// Tile DOM creation and positioning.
// Ported from collab-public/collab-electron/src/windows/shell/src/tile-renderer.js

import type { CanvasTile } from "./canvas-state";

export interface TileDOM {
  container: HTMLDivElement;
  titleBar: HTMLDivElement;
  titleText: HTMLSpanElement;
  contentArea: HTMLDivElement;
  contentOverlay: HTMLDivElement;
  closeBtn: HTMLButtonElement;
}

export interface TileCallbacks {
  onClose: (id: string) => void;
  onFocus: (id: string, e?: MouseEvent) => void;
  /** Double-click on content overlay to enter interactive mode */
  onInteract: (id: string) => void;
}

export function createTileDOM(
  tile: CanvasTile,
  callbacks: TileCallbacks,
): TileDOM {
  const container = document.createElement("div");
  container.className = "canvas-tile";
  container.dataset.tileId = tile.id;
  container.dataset.tileType = tile.type;

  const titleBar = document.createElement("div");
  titleBar.className = "tile-title-bar";

  const titleText = document.createElement("span");
  titleText.className = "tile-title-text";
  titleText.textContent = tile.type === "label" ? (tile.text ?? "Label") : "Terminal";
  titleBar.appendChild(titleText);

  const btnGroup = document.createElement("div");
  btnGroup.className = "tile-btn-group";

  const closeBtn = document.createElement("button");
  closeBtn.className = "tile-action-btn tile-close-btn";
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "Close tile";
  closeBtn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onClose(tile.id);
  });
  btnGroup.appendChild(closeBtn);
  titleBar.appendChild(btnGroup);

  // Clicking anywhere on the tile (including terminal content) activates it.
  // Use capture phase so this fires even when xterm stops propagation.
  container.addEventListener("pointerdown", () => {
    callbacks.onFocus(tile.id);
  }, true);

  const contentArea = document.createElement("div");
  contentArea.className = "tile-content";

  const contentOverlay = document.createElement("div");
  contentOverlay.className = "tile-content-overlay";

  // Double-click on overlay enters interactive mode (allows typing/scrolling)
  contentOverlay.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    callbacks.onInteract(tile.id);
  });



  container.appendChild(titleBar);
  container.appendChild(contentArea);
  contentArea.appendChild(contentOverlay);

  return { container, titleBar, titleText, contentArea, contentOverlay, closeBtn };
}

export function updateTileTitle(dom: TileDOM, tile: CanvasTile): void {
  if (tile.type === "label") {
    dom.titleText.textContent = tile.text ?? "Label";
  }
}

export function positionTile(
  container: HTMLElement,
  tile: CanvasTile,
  panX: number,
  panY: number,
  zoom: number,
): void {
  const sx = tile.x * zoom + panX;
  const sy = tile.y * zoom + panY;

  container.style.left = `${sx}px`;
  container.style.top = `${sy}px`;
  container.style.width = `${tile.width}px`;
  container.style.height = `${tile.height}px`;
  container.style.transform = `scale(${zoom})`;
  container.style.transformOrigin = "top left";
  container.style.zIndex = String(tile.zIndex);
}

export function positionAllTiles(
  tileDOMs: Map<string, TileDOM>,
  tiles: CanvasTile[],
  panX: number,
  panY: number,
  zoom: number,
): void {
  for (const tile of tiles) {
    const dom = tileDOMs.get(tile.id);
    if (dom) positionTile(dom.container, tile, panX, panY, zoom);
  }
}
