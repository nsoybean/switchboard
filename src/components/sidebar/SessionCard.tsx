import type { Session } from "../../state/types";

const STATUS_COLORS: Record<string, string> = {
  running: "var(--sb-status-running)",
  "needs-input": "var(--sb-status-waiting)",
  done: "var(--sb-status-done)",
  error: "var(--sb-status-error)",
};

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  bash: "bash",
};

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}

export function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  const statusColor = STATUS_COLORS[session.status] ?? "var(--sb-text-tertiary)";
  const isDone = session.status === "done" || session.status === "error";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        marginBottom: 4,
        cursor: "pointer",
        background: isActive ? "var(--sb-bg-active)" : "transparent",
        border: isActive ? "1px solid var(--sb-accent)" : "1px solid transparent",
        ...(session.status === "needs-input" && !isActive
          ? { borderLeft: "3px solid var(--sb-status-error)" }
          : {}),
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--sb-bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Session name */}
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: isDone ? "var(--sb-text-secondary)" : "var(--sb-text-primary)",
        }}
      >
        {session.label}
      </div>

      {/* Branch */}
      {session.branch && (
        <div style={{ fontSize: 10, color: "var(--sb-accent)", marginTop: 2 }}>
          {session.branch}
        </div>
      )}

      {/* Agent + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          color: "var(--sb-text-secondary)",
          marginTop: 4,
        }}
      >
        <span style={{ color: isDone ? "var(--sb-text-tertiary)" : "var(--sb-accent)" }}>
          {AGENT_LABELS[session.agent] ?? session.agent}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor,
              display: "inline-block",
              ...(session.status === "needs-input"
                ? { animation: "pulse 1.5s infinite" }
                : {}),
            }}
          />
          {session.status === "needs-input" ? "needs input" : session.status}
        </span>
      </div>
    </div>
  );
}
