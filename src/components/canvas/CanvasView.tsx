import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type ReactPortal,
} from "react";
import { createPortal } from "react-dom";
import type { Session } from "../../state/types";
import {
  type CanvasState,
  type CanvasTile,
  DEFAULT_SIZES,
  generateTileId,
  nextZIndex,
  snapToGrid,
} from "./canvas-state";
import { createViewport, type ViewportController } from "./canvas-viewport";
import {
  createTileDOM,
  positionAllTiles,
  positionTile,
  type TileDOM,
} from "./tile-renderer";
import { attachDrag, attachResize } from "./tile-interactions";
import { XTermContainer } from "../terminal/XTermContainer";
import "./CanvasView.css";

interface CanvasViewProps {
  sessions: Session[];
  activeSessionId: string | null;
  aliveSessionIds: Set<string>;
  onSessionSpawn: (sessionId: string, ptyId: number) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
  onSelectSession: (sessionId: string) => void;
  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;
}

// Error boundary for individual tile portals
class TileErrorBoundary extends React.Component<
  { children: React.ReactNode; tileId: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center size-full text-xs text-muted-foreground">
          Terminal error
        </div>
      );
    }
    return this.props.children;
  }
}

import React from "react";

export function CanvasView({
  sessions,
  aliveSessionIds,
  onSessionSpawn,
  onSessionExit,
  onSelectSession,
  canvasState,
  onCanvasStateChange,
}: CanvasViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const tileLayerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<ViewportController | null>(null);
  const tileDOMsRef = useRef<Map<string, TileDOM>>(new Map());
  const cleanupFnsRef = useRef<Map<string, (() => void)[]>>(new Map());
  const stateRef = useRef(canvasState);
  const [, forceRender] = useState(0);

  stateRef.current = canvasState;

  const notifyChange = useCallback(() => {
    onCanvasStateChange({ ...stateRef.current });
  }, [onCanvasStateChange]);

  const repositionAll = useCallback(() => {
    const { tiles, viewport } = stateRef.current;
    positionAllTiles(tileDOMsRef.current, tiles, viewport.panX, viewport.panY, viewport.zoom);
  }, []);

  // Disable pointer events on all tile content areas (prevents xterm stealing mouse)
  const disablePointerEvents = useCallback(() => {
    containerRef.current?.classList.add("is-dragging");
  }, []);
  const enablePointerEvents = useCallback(() => {
    containerRef.current?.classList.remove("is-dragging");
  }, []);

  const removeTileDOM = useCallback((tileId: string) => {
    // Cleanup interaction listeners
    const cleanups = cleanupFnsRef.current.get(tileId);
    if (cleanups) {
      for (const fn of cleanups) fn();
      cleanupFnsRef.current.delete(tileId);
    }
    // Remove DOM node
    const dom = tileDOMsRef.current.get(tileId);
    if (dom) {
      dom.container.remove();
      tileDOMsRef.current.delete(tileId);
    }
  }, []);

  const createTileElement = useCallback(
    (tile: CanvasTile) => {
      const tileLayer = tileLayerRef.current;
      if (!tileLayer) return;

      const dom = createTileDOM(tile, {
        onClose: (id) => {
          // Remove tile from state (portal unmounts via React render, then DOM removed)
          const tiles = stateRef.current.tiles.filter((t) => t.id !== id);
          stateRef.current = { ...stateRef.current, tiles };
          removeTileDOM(id);
          notifyChange();
          forceRender((n) => n + 1);
        },
        onFocus: (id) => {
          const tile = stateRef.current.tiles.find((t) => t.id === id);
          if (tile) {
            tile.zIndex = nextZIndex(stateRef.current.tiles);
            positionTile(
              tileDOMsRef.current.get(id)!.container,
              tile,
              stateRef.current.viewport.panX,
              stateRef.current.viewport.panY,
              stateRef.current.viewport.zoom,
            );
          }
          // Also select the session in sidebar
          if (tile?.sessionId) {
            onSelectSession(tile.sessionId);
          }
        },
      });

      // Attach interactions
      const cleanups: (() => void)[] = [];

      cleanups.push(
        attachDrag(dom.titleBar, tile, {
          viewport: stateRef.current.viewport,
          onUpdate: () => {
            positionTile(
              dom.container,
              tile,
              stateRef.current.viewport.panX,
              stateRef.current.viewport.panY,
              stateRef.current.viewport.zoom,
            );
          },
          disablePointerEvents,
          enablePointerEvents,
          onFocus: (id) => {
            const t = stateRef.current.tiles.find((t) => t.id === id);
            if (t) {
              t.zIndex = nextZIndex(stateRef.current.tiles);
            }
            if (t?.sessionId) onSelectSession(t.sessionId);
          },
        }),
      );

      cleanups.push(
        attachResize(dom.container, tile, {
          viewport: stateRef.current.viewport,
          onUpdate: () => {
            positionTile(
              dom.container,
              tile,
              stateRef.current.viewport.panX,
              stateRef.current.viewport.panY,
              stateRef.current.viewport.zoom,
            );
          },
          disablePointerEvents,
          enablePointerEvents,
          onFocus: () => notifyChange(),
        }),
      );

      cleanupFnsRef.current.set(tile.id, cleanups);
      tileDOMsRef.current.set(tile.id, dom);
      tileLayer.appendChild(dom.container);

      // Position it
      positionTile(
        dom.container,
        tile,
        stateRef.current.viewport.panX,
        stateRef.current.viewport.panY,
        stateRef.current.viewport.zoom,
      );
    },
    [disablePointerEvents, enablePointerEvents, notifyChange, onSelectSession, removeTileDOM],
  );

  // Initialize viewport on mount
  useEffect(() => {
    const container = containerRef.current;
    const gridCanvas = gridCanvasRef.current;
    if (!container || !gridCanvas) return;

    const vp = createViewport(container, gridCanvas);
    viewportRef.current = vp;

    vp.init(stateRef.current.viewport, () => {
      repositionAll();
      notifyChange();
    });

    return () => {
      vp.destroy();
      viewportRef.current = null;
    };
  }, [repositionAll, notifyChange]);

  // Sync tiles: create DOM for new tiles, remove DOM for deleted tiles
  useEffect(() => {
    const currentIds = new Set(canvasState.tiles.map((t) => t.id));
    const domIds = new Set(tileDOMsRef.current.keys());

    // Add new tiles
    for (const tile of canvasState.tiles) {
      if (!domIds.has(tile.id)) {
        createTileElement(tile);
      }
    }

    // Remove old tiles
    for (const id of domIds) {
      if (!currentIds.has(id)) {
        removeTileDOM(id);
      }
    }

    // Reposition all
    repositionAll();
  }, [canvasState.tiles, createTileElement, removeTileDOM, repositionAll]);

  // Auto-create tiles for sessions that don't have one
  useEffect(() => {
    const tilesWithSessions = new Set(
      canvasState.tiles.filter((t) => t.sessionId).map((t) => t.sessionId),
    );

    const newTiles: CanvasTile[] = [];
    let offsetIdx = 0;

    for (const session of sessions) {
      if (!tilesWithSessions.has(session.id)) {
        const size = DEFAULT_SIZES.terminal;
        // Place new tiles in a cascade from viewport center
        const vp = stateRef.current.viewport;
        const containerEl = containerRef.current;
        const cx = containerEl
          ? (containerEl.clientWidth / 2 - vp.panX) / vp.zoom
          : 200;
        const cy = containerEl
          ? (containerEl.clientHeight / 2 - vp.panY) / vp.zoom
          : 200;

        const tile: CanvasTile = {
          id: generateTileId(),
          type: "terminal",
          x: cx - size.width / 2 + offsetIdx * 40,
          y: cy - size.height / 2 + offsetIdx * 40,
          width: size.width,
          height: size.height,
          zIndex: nextZIndex([...canvasState.tiles, ...newTiles]),
          sessionId: session.id,
        };
        snapToGrid(tile);
        newTiles.push(tile);
        offsetIdx++;
      }
    }

    // Remove tiles for deleted sessions
    const sessionIds = new Set(sessions.map((s) => s.id));
    const removedTiles = canvasState.tiles.filter(
      (t) => t.type === "terminal" && t.sessionId && !sessionIds.has(t.sessionId),
    );

    if (newTiles.length > 0 || removedTiles.length > 0) {
      const remainingTiles = canvasState.tiles.filter(
        (t) => !removedTiles.some((r) => r.id === t.id),
      );
      onCanvasStateChange({
        ...canvasState,
        tiles: [...remainingTiles, ...newTiles],
      });
    }
  }, [sessions, canvasState, onCanvasStateChange]);

  // Update tile title texts when session labels change
  useEffect(() => {
    for (const tile of canvasState.tiles) {
      if (tile.type === "terminal" && tile.sessionId) {
        const dom = tileDOMsRef.current.get(tile.id);
        const session = sessions.find((s) => s.id === tile.sessionId);
        if (dom && session) {
          dom.titleText.textContent = session.label;
        }
      }
    }
  }, [sessions, canvasState.tiles]);

  // Build portals for terminal tiles
  const portals: ReactPortal[] = [];
  for (const tile of canvasState.tiles) {
    if (tile.type !== "terminal" || !tile.sessionId) continue;
    if (!aliveSessionIds.has(tile.sessionId)) continue;

    const dom = tileDOMsRef.current.get(tile.id);
    if (!dom) continue;

    const session = sessions.find((s) => s.id === tile.sessionId);
    if (!session) continue;

    portals.push(
      createPortal(
        <TileErrorBoundary key={tile.id} tileId={tile.id}>
          <XTermContainer
            command={session.command}
            args={session.args}
            cwd={session.cwd}
            env={session.env}
            isActive={true}
            onSpawn={(ptyId) => onSessionSpawn(session.id, ptyId)}
            onExit={onSessionExit(session.id)}
          />
        </TileErrorBoundary>,
        dom.contentArea,
        tile.id,
      ),
    );
  }

  // Build portals for label tiles
  for (const tile of canvasState.tiles) {
    if (tile.type !== "label") continue;
    const dom = tileDOMsRef.current.get(tile.id);
    if (!dom) continue;

    portals.push(
      createPortal(
        <input
          key={tile.id}
          className="label-tile-input"
          style={{ fontSize: tile.fontSize ?? 16 }}
          defaultValue={tile.text ?? ""}
          placeholder="Label..."
          onBlur={(e) => {
            tile.text = e.target.value;
            notifyChange();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />,
        dom.contentArea,
        tile.id,
      ),
    );
  }

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas ref={gridCanvasRef} id="grid-canvas" />
      <div ref={tileLayerRef} id="tile-layer" />
      <div id="zoom-indicator" className="zoom-indicator" />
      {portals}
    </div>
  );
}
