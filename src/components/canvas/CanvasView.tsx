import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { Rnd } from "react-rnd";
import { Circle, Square } from "lucide-react";
import { AgentIcon } from "../agents/AgentIcon";
import { XTermContainer } from "../terminal/XTermContainer";
import type { Session } from "../../state/types";
import {
  type CanvasState,
  type CanvasTile,
  DEFAULT_SIZES,
  defaultCanvasState,
} from "./canvas-state";
import "./CanvasView.css";

const MIN_CANVAS_SCALE = 0.35;
const MAX_CANVAS_SCALE = 1.8;
const WHEEL_ZOOM_SENSITIVITY = 0.0028;
const TILE_STAGGER_X = 34;
const TILE_STAGGER_Y = 30;
const DOT_GRID_SIZE = 24;
const DOT_GRID_INSET = 1.7;
const DOT_GRID_MAX_OVERSHOOT = 0.14;

interface CanvasAnchor {
  pointerX: number;
  pointerY: number;
  worldX: number;
  worldY: number;
}

interface CanvasViewProps {
  projectPath: string | null;
  sessions: Session[];
  activeSessionId: string | null;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void;
}

export interface CanvasViewHandle {
  panToSession: (sessionId: string) => void;
  unfocusTile: () => void;
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, value));
}

function applyElasticScale(value: number) {
  if (value < MIN_CANVAS_SCALE) {
    return (
      MIN_CANVAS_SCALE -
      Math.tanh((MIN_CANVAS_SCALE - value) * 2.4) * DOT_GRID_MAX_OVERSHOOT
    );
  }

  if (value > MAX_CANVAS_SCALE) {
    return (
      MAX_CANVAS_SCALE +
      Math.tanh((value - MAX_CANVAS_SCALE) * 2.4) * DOT_GRID_MAX_OVERSHOOT
    );
  }

  return value;
}

function createTileForSession(
  sessionId: string,
  index: number,
  viewport: CanvasState["viewport"],
): CanvasTile {
  const zoom = clampZoom(viewport.zoom);
  return {
    id: `tile:${sessionId}`,
    type: "terminal",
    sessionId,
    width: DEFAULT_SIZES.terminal.width,
    height: DEFAULT_SIZES.terminal.height,
    x: (84 - viewport.panX) / zoom + index * (TILE_STAGGER_X / zoom),
    y: (96 - viewport.panY) / zoom + index * (TILE_STAGGER_Y / zoom),
    zIndex: index + 1,
  };
}

function statusTone(status: Session["status"]) {
  switch (status) {
    case "running":
      return "var(--sb-status-running)";
    case "needs-input":
      return "var(--sb-status-warning)";
    case "done":
      return "var(--sb-status-done)";
    case "error":
      return "var(--sb-status-error)";
    default:
      return "var(--muted-foreground)";
  }
}

interface SessionTileProps {
  session: Session;
  tile: CanvasTile;
  zoom: number;
  zIndex: number;
  isActive: boolean;
  onFocus: (sessionId: string) => void;
  onMove: (tileId: string, x: number, y: number) => void;
  onResize: (tileId: string, width: number, height: number, x: number, y: number) => void;
  onStopSession: (sessionId: string) => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
}

function SessionTileComponent({
  session,
  tile,
  zoom,
  zIndex,
  isActive,
  onFocus,
  onMove,
  onResize,
  onStopSession,
  onSessionStart,
  onSessionExit,
}: SessionTileProps) {
  const focusFrameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
    },
    [],
  );

  const handleStart = useCallback(() => {
    onSessionStart(session.id);
  }, [onSessionStart, session.id]);

  const handleExit = useMemo(() => onSessionExit(session.id), [onSessionExit, session.id]);

  const scheduleFocus = useCallback(() => {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }

    focusFrameRef.current = window.requestAnimationFrame(() => {
      onFocus(session.id);
      focusFrameRef.current = null;
    });
  }, [onFocus, session.id]);

  return (
    <Rnd
      position={{ x: tile.x, y: tile.y }}
      size={{ width: tile.width, height: tile.height }}
      minWidth={360}
      minHeight={220}
      scale={zoom}
      dragHandleClassName="sb-canvas-tile__titlebar"
      onMouseDown={scheduleFocus}
      onDragStart={scheduleFocus}
      onDrag={(_event, data) => onMove(tile.id, data.x, data.y)}
      onResizeStart={scheduleFocus}
      onResize={(_event, _direction, ref, _delta, position) => {
        onResize(tile.id, ref.offsetWidth, ref.offsetHeight, position.x, position.y);
      }}
      style={{ zIndex }}
    >
      <article className={`sb-canvas-tile ${isActive ? "is-active" : ""}`}>
        <header className="sb-canvas-tile__titlebar">
          <div className="sb-canvas-tile__identity">
            <AgentIcon agent={session.agent} className="size-3.5" />
            <span className="sb-canvas-tile__title" title={session.label}>
              {session.label}
            </span>
          </div>
          <div className="sb-canvas-tile__meta">
            <span className="sb-canvas-tile__status">
              <Circle
                className="size-2 fill-current"
                style={{ color: statusTone(session.status) }}
              />
              {session.status}
            </span>
            <button
              type="button"
              className="sb-canvas-tile__stop"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onStopSession(session.id)}
              aria-label={`Stop ${session.label}`}
              title="Stop session"
            >
              <Square className="size-3" />
            </button>
          </div>
        </header>

        <div className="sb-canvas-tile__terminal">
          <XTermContainer
            tileId={session.id}
            command={session.command}
            args={session.args}
            cwd={session.cwd}
            env={session.env}
            onStart={handleStart}
            onExit={handleExit}
          />
        </div>
      </article>
    </Rnd>
  );
}

const SessionTile = memo(SessionTileComponent);

export const CanvasView = forwardRef<CanvasViewHandle, CanvasViewProps>(function CanvasView(
  {
    projectPath,
    sessions,
    activeSessionId,
    onSessionStart,
    onSessionExit,
    onSelectSession,
    onStopSession,
  },
  ref,
) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>(defaultCanvasState());
  const [tileStack, setTileStack] = useState<string[]>([]);
  const stateRef = useRef(canvasState);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  stateRef.current = canvasState;

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!projectPath) {
      setCanvasState(defaultCanvasState());
      stateRef.current = defaultCanvasState();
      setTileStack([]);
      return;
    }

    let cancelled = false;

    invoke<string | null>("load_canvas_state", {
      projectPath,
    })
      .then((raw) => {
        if (cancelled) {
          return;
        }

        let nextState = defaultCanvasState();
        if (raw) {
          try {
            nextState = JSON.parse(raw) as CanvasState;
          } catch {
            console.warn("Failed to parse canvas state, using default");
          }
        }

        stateRef.current = nextState;
        setCanvasState(nextState);
        setTileStack(
          [...nextState.tiles]
            .sort((left, right) => left.zIndex - right.zIndex)
            .map((tile) => tile.id),
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        const nextState = defaultCanvasState();
        stateRef.current = nextState;
        setCanvasState(nextState);
        setTileStack([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const sessionMap = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );

  const updateState = useCallback(
    (updater: (state: CanvasState) => CanvasState) => {
      const nextState = updater(stateRef.current);
      if (nextState === stateRef.current) {
        return;
      }
      stateRef.current = nextState;
      setCanvasState(nextState);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      if (!projectPath) {
        return;
      }

      const persistProjectPath = projectPath;
      saveTimerRef.current = setTimeout(() => {
        invoke("save_canvas_state", {
          projectPath: persistProjectPath,
          state: JSON.stringify(nextState),
        }).catch(console.error);
      }, 500);
    },
    [projectPath],
  );

  useEffect(() => {
    updateState((current) => {
      const liveSessionIds = new Set(sessions.map((session) => session.id));
      const keptTiles = current.tiles.filter((tile) => liveSessionIds.has(tile.sessionId));
      const existingSessionIds = new Set(keptTiles.map((tile) => tile.sessionId));
      const createdTiles = sessions
        .filter((session) => !existingSessionIds.has(session.id))
        .map((session, index) =>
          createTileForSession(session.id, keptTiles.length + index, current.viewport),
        );

      if (createdTiles.length === 0 && keptTiles.length === current.tiles.length) {
        return current;
      }

      return {
        ...current,
        tiles: [...keptTiles, ...createdTiles],
      };
    });
  }, [sessions, updateState]);

  useEffect(() => {
    setTileStack((current) => {
      const persistedOrder = [...canvasState.tiles]
        .sort((left, right) => left.zIndex - right.zIndex)
        .map((tile) => tile.id);
      const existing = current.filter((tileId) =>
        persistedOrder.includes(tileId),
      );
      const missing = persistedOrder.filter((tileId) => !existing.includes(tileId));
      const next = [...existing, ...missing];

      if (
        next.length === current.length &&
        next.every((tileId, index) => tileId === current[index])
      ) {
        return current;
      }

      return next;
    });
  }, [canvasState.tiles]);

  const orderedTiles = useMemo(
    () => {
      const stackIndex = new Map(tileStack.map((tileId, index) => [tileId, index]));

      return canvasState.tiles.map((tile) => ({
        tile,
        zIndex: (stackIndex.get(tile.id) ?? 0) + 1,
      }));
    },
    [canvasState.tiles, tileStack],
  );

  const getViewportPoint = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    };
  }, []);

  const getWorldPoint = useCallback(
    (pointerX: number, pointerY: number, zoom = stateRef.current.viewport.zoom) => ({
      worldX: (pointerX - stateRef.current.viewport.panX) / zoom,
      worldY: (pointerY - stateRef.current.viewport.panY) / zoom,
    }),
    [],
  );

  const centerSession = useCallback(
    (sessionId: string) => {
      const tile = stateRef.current.tiles.find((candidate) => candidate.sessionId === sessionId);
      const viewport = viewportRef.current;
      if (!tile || !viewport) {
        return;
      }

      const zoom = clampZoom(stateRef.current.viewport.zoom);
      updateState((current) => ({
        ...current,
        viewport: {
          ...current.viewport,
          panX: viewport.clientWidth / 2 - (tile.x + tile.width / 2) * zoom,
          panY: viewport.clientHeight / 2 - (tile.y + tile.height / 2) * zoom,
          zoom,
        },
      }));
    },
    [updateState],
  );

  useImperativeHandle(
    ref,
    () => ({
      panToSession: centerSession,
      unfocusTile: () => {
        const textarea = document.querySelector(".xterm-helper-textarea");
        if (textarea instanceof HTMLElement) {
          textarea.blur();
        }
      },
    }),
    [centerSession],
  );

  const focusSession = useCallback(
    (sessionId: string) => {
      onSelectSession(sessionId);

      const tileId = stateRef.current.tiles.find(
        (candidate) => candidate.sessionId === sessionId,
      )?.id;
      if (!tileId) {
        return;
      }

      setTileStack((current) => {
        const next = [
          ...current.filter((candidate) => candidate !== tileId),
          tileId,
        ];

        if (
          next.length === current.length &&
          next.every((candidate, index) => candidate === current[index])
        ) {
          return current;
        }

        return next;
      });
    },
    [onSelectSession],
  );

  const moveTile = useCallback(
    (tileId: string, x: number, y: number) => {
      updateState((current) => ({
        ...current,
        tiles: current.tiles.map((candidate) =>
          candidate.id === tileId ? { ...candidate, x, y } : candidate,
        ),
      }));
    },
    [updateState],
  );

  const resizeTile = useCallback(
    (tileId: string, width: number, height: number, x: number, y: number) => {
      updateState((current) => ({
        ...current,
        tiles: current.tiles.map((candidate) =>
          candidate.id === tileId
            ? {
                ...candidate,
                width: Math.max(360, width),
                height: Math.max(220, height),
                x,
                y,
              }
            : candidate,
        ),
      }));
    },
    [updateState],
  );

  const setViewportScaleAtAnchor = useCallback(
    (rawZoom: number, pointerX: number, pointerY: number, anchor?: CanvasAnchor) => {
      const nextZoom = applyElasticScale(rawZoom);
      const nextAnchor = anchor ?? {
        pointerX,
        pointerY,
        ...getWorldPoint(pointerX, pointerY),
      };

      updateState((current) => ({
        ...current,
        viewport: {
          panX: pointerX - nextAnchor.worldX * nextZoom,
          panY: pointerY - nextAnchor.worldY * nextZoom,
          zoom: nextZoom,
        },
      }));
    },
    [getWorldPoint, updateState],
  );

  const backgroundStyle = useMemo(
    () => ({
      backgroundImage: `radial-gradient(circle at ${Math.max(1, DOT_GRID_INSET * canvasState.viewport.zoom)}px ${Math.max(1, DOT_GRID_INSET * canvasState.viewport.zoom)}px, rgba(91, 101, 112, 0.18) ${Math.max(0.9, 1.15 * canvasState.viewport.zoom)}px, transparent ${Math.max(1.15, 1.45 * canvasState.viewport.zoom)}px)`,
      backgroundSize: `${DOT_GRID_SIZE * canvasState.viewport.zoom}px ${DOT_GRID_SIZE * canvasState.viewport.zoom}px`,
      backgroundPosition: `${canvasState.viewport.panX}px ${canvasState.viewport.panY}px`,
    }),
    [canvasState.viewport.panX, canvasState.viewport.panY, canvasState.viewport.zoom],
  );

  const handlePanStart = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest(".sb-canvas-tile")) {
        return;
      }

      event.preventDefault();

      const startX = event.clientX;
      const startY = event.clientY;
      const startPanX = stateRef.current.viewport.panX;
      const startPanY = stateRef.current.viewport.panY;

      const handleMove = (moveEvent: PointerEvent) => {
        updateState((current) => ({
          ...current,
          viewport: {
            ...current.viewport,
            panX: startPanX + (moveEvent.clientX - startX),
            panY: startPanY + (moveEvent.clientY - startY),
          },
        }));
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [updateState],
  );

  return (
    <section
      ref={viewportRef}
      className="sb-canvas"
      style={backgroundStyle}
      onPointerDown={handlePanStart}
      onWheel={(event) => {
        if ((event.target as HTMLElement).closest(".sb-canvas-tile")) {
          return;
        }

        event.preventDefault();

        if (event.ctrlKey || event.metaKey) {
          const pointer = getViewportPoint(event.clientX, event.clientY);
          setViewportScaleAtAnchor(
            stateRef.current.viewport.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
            pointer.x,
            pointer.y,
          );
          return;
        }

        updateState((current) => ({
          ...current,
          viewport: {
            ...current.viewport,
            panX: current.viewport.panX - event.deltaX,
            panY: current.viewport.panY - event.deltaY,
          },
        }));
      }}
    >
      <div
        className="sb-canvas__inner"
        style={{
          transform: `translate(${canvasState.viewport.panX}px, ${canvasState.viewport.panY}px) scale(${canvasState.viewport.zoom})`,
        }}
      >
        {orderedTiles.map(({ tile, zIndex }) => {
          const session = sessionMap.get(tile.sessionId);
          if (!session) {
            return null;
          }

          return (
            <SessionTile
              key={tile.id}
              session={session}
              tile={tile}
              zoom={canvasState.viewport.zoom}
              zIndex={zIndex}
              isActive={session.id === activeSessionId}
              onFocus={focusSession}
              onMove={moveTile}
              onResize={resizeTile}
              onStopSession={onStopSession}
              onSessionStart={onSessionStart}
              onSessionExit={onSessionExit}
            />
          );
        })}
      </div>
    </section>
  );
});
