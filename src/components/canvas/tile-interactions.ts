// Tile drag, resize, and marquee selection.
// Ported from collab-public/collab-electron/src/windows/shell/src/tile-interactions.js

import { snapToGrid, MIN_SIZES, type CanvasTile, type CanvasViewport } from "./canvas-state";

const CLICK_THRESHOLD = 3;

// ── Drag ──

export interface DragOptions {
  viewport: CanvasViewport;
  onUpdate: () => void;
  disablePointerEvents: () => void;
  enablePointerEvents: () => void;
  onFocus?: (tileId: string, e?: MouseEvent) => void;
}

export function attachDrag(
  titleBar: HTMLElement,
  tile: CanvasTile,
  opts: DragOptions,
): () => void {
  function startDrag(e: MouseEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    if (opts.onFocus) opts.onFocus(tile.id, e);

    const startMX = e.clientX;
    const startMY = e.clientY;
    const startTX = tile.x;
    const startTY = tile.y;

    opts.disablePointerEvents();

    let moved = false;

    function onMove(e: MouseEvent): void {
      const dx = (e.clientX - startMX) / opts.viewport.zoom;
      const dy = (e.clientY - startMY) / opts.viewport.zoom;
      const dist = Math.hypot(e.clientX - startMX, e.clientY - startMY);
      if (dist >= CLICK_THRESHOLD) moved = true;

      tile.x = startTX + dx;
      tile.y = startTY + dy;
      opts.onUpdate();
    }

    function onUp(): void {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      opts.enablePointerEvents();

      if (moved) {
        snapToGrid(tile);
        opts.onUpdate();
      }
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  titleBar.addEventListener("mousedown", startDrag);

  return () => {
    titleBar.removeEventListener("mousedown", startDrag);
  };
}

// ── Resize ──

export interface ResizeOptions {
  viewport: CanvasViewport;
  onUpdate: () => void;
  disablePointerEvents: () => void;
  enablePointerEvents: () => void;
  onFocus?: () => void;
}

export function attachResize(
  container: HTMLElement,
  tile: CanvasTile,
  opts: ResizeOptions,
): () => void {
  const edges = ["n", "s", "e", "w"] as const;
  const corners = ["nw", "ne", "sw", "se"] as const;
  const handles: HTMLDivElement[] = [];

  for (const dir of [...edges, ...corners]) {
    const handle = document.createElement("div");
    const kind = dir.length === 1 ? "edge" : "corner";
    handle.className = `tile-resize-handle ${kind}-${dir}`;
    handles.push(handle);

    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startMX = e.clientX;
      const startMY = e.clientY;
      const startX = tile.x;
      const startY = tile.y;
      const startW = tile.width;
      const startH = tile.height;
      const min = MIN_SIZES[tile.type] || MIN_SIZES.terminal;

      opts.disablePointerEvents();

      function onMove(e: MouseEvent): void {
        const dx = (e.clientX - startMX) / opts.viewport.zoom;
        const dy = (e.clientY - startMY) / opts.viewport.zoom;

        if (dir.includes("e")) {
          tile.width = Math.max(min.width, startW + dx);
        }
        if (dir.includes("w")) {
          const newW = Math.max(min.width, startW - dx);
          tile.x = startX + (startW - newW);
          tile.width = newW;
        }
        if (dir.includes("s")) {
          tile.height = Math.max(min.height, startH + dy);
        }
        if (dir.includes("n")) {
          const newH = Math.max(min.height, startH - dy);
          tile.y = startY + (startH - newH);
          tile.height = newH;
        }

        opts.onUpdate();
      }

      function onUp(): void {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        opts.enablePointerEvents();
        snapToGrid(tile);
        opts.onUpdate();
        if (opts.onFocus) opts.onFocus();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    container.appendChild(handle);
  }

  return () => {
    for (const h of handles) h.remove();
  };
}

// ── Marquee selection ──

export interface MarqueeOptions {
  viewport: CanvasViewport;
  tiles: () => CanvasTile[];
  onSelectionChange: (ids: Set<string>) => void;
}

export function attachMarquee(
  canvasEl: HTMLElement,
  opts: MarqueeOptions,
): () => void {
  const tileLayer = canvasEl.querySelector("#tile-layer");
  const gridCanvas = canvasEl.querySelector("#grid-canvas");

  function handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (e.target !== canvasEl && e.target !== tileLayer && e.target !== gridCanvas) return;

    e.preventDefault();
    if (document.activeElement) (document.activeElement as HTMLElement).blur();

    const startSX = e.clientX;
    const startSY = e.clientY;

    const marquee = document.createElement("div");
    marquee.className = "selection-marquee";
    marquee.style.position = "fixed";
    marquee.style.left = `${startSX}px`;
    marquee.style.top = `${startSY}px`;
    marquee.style.width = "0px";
    marquee.style.height = "0px";
    document.body.appendChild(marquee);

    let moved = false;

    function onMove(e: MouseEvent): void {
      const curSX = e.clientX;
      const curSY = e.clientY;
      const dist = Math.hypot(curSX - startSX, curSY - startSY);
      if (dist >= CLICK_THRESHOLD) moved = true;

      marquee.style.left = `${Math.min(startSX, curSX)}px`;
      marquee.style.top = `${Math.min(startSY, curSY)}px`;
      marquee.style.width = `${Math.abs(curSX - startSX)}px`;
      marquee.style.height = `${Math.abs(curSY - startSY)}px`;
    }

    function onUp(e: MouseEvent): void {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      marquee.remove();

      if (!moved) {
        opts.onSelectionChange(new Set());
        return;
      }

      const curSX = e.clientX;
      const curSY = e.clientY;
      const mLeft = Math.min(startSX, curSX);
      const mTop = Math.min(startSY, curSY);
      const mRight = Math.max(startSX, curSX);
      const mBottom = Math.max(startSY, curSY);

      const viewerRect = canvasEl.getBoundingClientRect();
      const toCanvas = (sx: number, sy: number) => ({
        x: (sx - viewerRect.left - opts.viewport.panX) / opts.viewport.zoom,
        y: (sy - viewerRect.top - opts.viewport.panY) / opts.viewport.zoom,
      });

      const cTL = toCanvas(mLeft, mTop);
      const cBR = toCanvas(mRight, mBottom);

      const hitIds = new Set<string>();
      for (const t of opts.tiles()) {
        const tRight = t.x + t.width;
        const tBottom = t.y + t.height;
        if (t.x < cBR.x && tRight > cTL.x && t.y < cBR.y && tBottom > cTL.y) {
          hitIds.add(t.id);
        }
      }

      opts.onSelectionChange(hitIds);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  canvasEl.addEventListener("mousedown", handleMouseDown);

  return () => {
    canvasEl.removeEventListener("mousedown", handleMouseDown);
  };
}
