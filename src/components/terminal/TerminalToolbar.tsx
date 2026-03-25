import type { Session } from "../../state/types";

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  bash: "bash",
};

interface TerminalToolbarProps {
  session: Session | null;
  gitPanelOpen?: boolean;
  onToggleGitPanel?: () => void;
}

export function TerminalToolbar({
  session,
  gitPanelOpen,
  onToggleGitPanel,
}: TerminalToolbarProps) {
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
      <div
        className="flex items-center"
        style={{ marginLeft: "auto", gap: 12 }}
      >
        <span style={{ color: "var(--sb-text-tertiary)", fontSize: 11 }}>
          {session.cwd.split("/").slice(-2).join("/")}
        </span>
        {onToggleGitPanel && (
          <button
            onClick={onToggleGitPanel}
            title="Toggle Git Panel (Ctrl+G)"
            style={{
              padding: "2px 8px",
              fontSize: 11,
              background: gitPanelOpen
                ? "var(--sb-bg-active)"
                : "var(--sb-bg-primary)",
              border: `1px solid ${gitPanelOpen ? "var(--sb-accent)" : "var(--sb-border)"}`,
              borderRadius: 4,
              color: gitPanelOpen
                ? "var(--sb-text-primary)"
                : "var(--sb-text-tertiary)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Git
          </button>
        )}
      </div>
    </div>
  );
}
