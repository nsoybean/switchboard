import type { Session } from "../../state/types";

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  bash: "bash",
};

interface TerminalToolbarProps {
  session: Session | null;
}

export function TerminalToolbar({ session }: TerminalToolbarProps) {
  if (!session) {
    return (
      <div
        className="flex items-center"
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--sb-border)",
          background: "var(--sb-bg-primary)",
          fontSize: 12,
          color: "var(--sb-text-secondary)",
        }}
      >
        Switchboard v0.1.0
      </div>
    );
  }

  return (
    <div
      className="flex items-center"
      style={{
        padding: "8px 16px",
        borderBottom: "1px solid var(--sb-border)",
        background: "var(--sb-bg-primary)",
        fontSize: 12,
        gap: 16,
      }}
    >
      <span style={{ color: "var(--sb-text-primary)", fontWeight: 600 }}>
        {session.label}
      </span>
      <span style={{ color: "var(--sb-accent)" }}>
        {AGENT_LABELS[session.agent] ?? session.agent}
      </span>
      {session.branch && (
        <span style={{ color: "var(--sb-text-secondary)" }}>
          {session.branch}
        </span>
      )}
      <div style={{ marginLeft: "auto", color: "var(--sb-text-tertiary)" }}>
        {session.cwd}
      </div>
    </div>
  );
}
