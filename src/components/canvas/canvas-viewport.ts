// Canvas viewport: pan, zoom, dot grid rendering.
// Ported from collab-public/collab-electron/src/windows/shell/src/canvas-viewport.js

import { CELL, MAJOR, type CanvasViewport } from "./canvas-state";

const ZOOM_MIN = 0.33;
const ZOOM_MAX = 1;
const ZOOM_RUBBER_BAND_K = 400;

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

function shouldZoom(e: WheelEvent): boolean {
  return e.ctrlKey || (IS_MAC && e.metaKey);
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export interface ViewportController {
  init(state: CanvasViewport, callback: () => void): void;
  updateCanvas(): void;
  applyZoom(deltaY: number, focalX: number, focalY: number): void;
  destroy(): void;
}

export function createViewport(
  canvasEl: HTMLElement,
  gridCanvas: HTMLCanvasElement,
): ViewportController {
  const gridCtx = gridCanvas.getContext("2d")!;
  let state: CanvasViewport | null = null;
  let onUpdate: (() => void) | null = null;
  let zoomSnapTimer: ReturnType<typeof setTimeout> | null = null;
  let zoomSnapRaf: number | null = null;
  let lastZoomFocalX = 0;
  let lastZoomFocalY = 0;
  let prevCanvasW = canvasEl.clientWidth;
  let prevCanvasH = canvasEl.clientHeight;

  function resizeGridCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    gridCanvas.width = w * dpr;
    gridCanvas.height = h * dpr;
    gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawGrid(): void {
    if (!state) return;
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    if (w === 0 || h === 0) return;

    const dark = isDark();
    gridCtx.clearRect(0, 0, w, h);

    const step = CELL * state.zoom;
    const majorStep = MAJOR * state.zoom;
    const offX = ((state.panX % majorStep) + majorStep) % majorStep;
    const offY = ((state.panY % majorStep) + majorStep) % majorStep;

    const dotOffX = ((state.panX % step) + step) % step;
    const dotOffY = ((state.panY % step) + step) % step;
    const dotSize = Math.max(1, 1.5 * state.zoom);

    gridCtx.fillStyle = dark
      ? "rgba(255,255,255,0.15)"
      : "rgba(0,0,0,0.25)";
    for (let x = dotOffX; x <= w; x += step) {
      for (let y = dotOffY; y <= h; y += step) {
        gridCtx.fillRect(Math.round(x), Math.round(y), dotSize, dotSize);
      }
    }

    const majorDotSize = Math.max(1, 1.5 * state.zoom);
    gridCtx.fillStyle = dark
      ? "rgba(255,255,255,0.25)"
      : "rgba(0,0,0,0.40)";
    for (let x = offX; x <= w; x += majorStep) {
      for (let y = offY; y <= h; y += majorStep) {
        gridCtx.fillRect(Math.round(x), Math.round(y), majorDotSize, majorDotSize);
      }
    }
  }

  function updateCanvas(): void {
    drawGrid();
    if (onUpdate) onUpdate();
  }

  function snapBackZoom(): void {
    if (!state) return;
    const fx = lastZoomFocalX;
    const fy = lastZoomFocalY;
    const target = state.zoom > ZOOM_MAX ? ZOOM_MAX : ZOOM_MIN;

    function animate(): void {
      if (!state) return;
      const prevScale = state.zoom;
      state.zoom += (target - state.zoom) * 0.15;

      if (Math.abs(state.zoom - target) < 0.001) {
        state.zoom = target;
      }

      const ratio = state.zoom / prevScale - 1;
      state.panX -= (fx - state.panX) * ratio;
      state.panY -= (fy - state.panY) * ratio;
      updateCanvas();

      if (state.zoom === target) {
        zoomSnapRaf = null;
        return;
      }
      zoomSnapRaf = requestAnimationFrame(animate);
    }

    zoomSnapRaf = requestAnimationFrame(animate);
  }

  function applyZoom(deltaY: number, focalX: number, focalY: number): void {
    if (!state) return;
    if (zoomSnapRaf) {
      cancelAnimationFrame(zoomSnapRaf);
      zoomSnapRaf = null;
    }
    if (zoomSnapTimer) {
      clearTimeout(zoomSnapTimer);
      zoomSnapTimer = null;
    }

    const prevScale = state.zoom;
    const MAX_ZOOM_DELTA = 25;
    const clamped =
      Math.sign(deltaY) * Math.min(Math.abs(deltaY), MAX_ZOOM_DELTA);
    let factor = Math.exp((-clamped * 0.6) / 100);

    if (state.zoom >= ZOOM_MAX && factor > 1) {
      const overshoot = state.zoom / ZOOM_MAX - 1;
      const damping = 1 / (1 + overshoot * ZOOM_RUBBER_BAND_K);
      factor = 1 + (factor - 1) * damping;
      state.zoom *= factor;
    } else if (state.zoom <= ZOOM_MIN && factor < 1) {
      const overshoot = ZOOM_MIN / state.zoom - 1;
      const damping = 1 / (1 + overshoot * ZOOM_RUBBER_BAND_K);
      factor = 1 - (1 - factor) * damping;
      state.zoom *= factor;
    } else {
      state.zoom *= factor;
    }

    const ratio = state.zoom / prevScale - 1;
    state.panX -= (focalX - state.panX) * ratio;
    state.panY -= (focalY - state.panY) * ratio;
    lastZoomFocalX = focalX;
    lastZoomFocalY = focalY;

    if (state.zoom > ZOOM_MAX || state.zoom < ZOOM_MIN) {
      zoomSnapTimer = setTimeout(snapBackZoom, 150);
    }

    updateCanvas();
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!state) return;

    if (shouldZoom(e)) {
      const rect = canvasEl.getBoundingClientRect();
      applyZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      state.panX -= e.deltaX * 1.2;
      state.panY -= e.deltaY * 1.2;
      updateCanvas();
    }
  }

  canvasEl.addEventListener("wheel", handleWheel, { passive: false });

  const resizeObserver = new ResizeObserver(() => {
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    if (!state) {
      prevCanvasW = w;
      prevCanvasH = h;
      return;
    }
    state.panX += (w - prevCanvasW) / 2;
    state.panY += (h - prevCanvasH) / 2;
    prevCanvasW = w;
    prevCanvasH = h;
    resizeGridCanvas();
    updateCanvas();
  });
  resizeObserver.observe(canvasEl);

  resizeGridCanvas();

  return {
    init(viewportState: CanvasViewport, callback: () => void) {
      state = viewportState;
      onUpdate = callback;
      updateCanvas();
    },
    updateCanvas,
    applyZoom,
    destroy() {
      canvasEl.removeEventListener("wheel", handleWheel);
      resizeObserver.disconnect();
      if (zoomSnapRaf) cancelAnimationFrame(zoomSnapRaf);
      if (zoomSnapTimer) clearTimeout(zoomSnapTimer);
    },
  };
}
