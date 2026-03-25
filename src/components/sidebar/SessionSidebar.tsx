import { useAppState, useAppDispatch } from "../../state/context";
import { SessionCard } from "./SessionCard";

interface SessionSidebarProps {
  onNewSession: () => void;
}

export function SessionSidebar({ onNewSession }: SessionSidebarProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const sessions = Object.values(state.sessions).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 260,
        minWidth: 260,
        background: "var(--sb-bg-surface)",
        borderRight: "1px solid var(--sb-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--sb-border)",
        }}
      >
        <h1
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.5px",
            color: "var(--sb-text-primary)",
          }}
        >
          SWITCHBOARD
        </h1>
        <button
          onClick={onNewSession}
          style={{
            background: "var(--sb-accent)",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + New
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 8 }}>
        {sessions.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--sb-text-tertiary)", fontSize: 12 }}
          >
            <p className="text-center">No sessions yet.</p>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={state.activeSessionId === session.id}
              onClick={() => dispatch({ type: "SET_ACTIVE", id: session.id })}
            />
          ))
        )}
      </div>
    </div>
  );
}
