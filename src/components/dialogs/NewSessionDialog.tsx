import { useState } from "react";
import type { AgentType } from "../../state/types";

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (config: {
    agent: AgentType;
    label: string;
    task: string;
    useWorktree: boolean;
  }) => void;
}

const AGENTS: { id: AgentType; name: string; command: string }[] = [
  { id: "claude-code", name: "Claude Code", command: "claude" },
  { id: "codex", name: "Codex", command: "codex" },
  { id: "bash", name: "Bash", command: "/bin/bash" },
];

export function NewSessionDialog({
  open,
  onClose,
  onSubmit,
}: NewSessionDialogProps) {
  const [agent, setAgent] = useState<AgentType>("claude-code");
  const [label, setLabel] = useState("");
  const [task, setTask] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);

  if (!open) return null;

  const handleSubmit = () => {
    onSubmit({
      agent,
      label: label.trim() || `${agent}-${Date.now().toString(36)}`,
      task: task.trim(),
      useWorktree,
    });
    setLabel("");
    setTask("");
    setUseWorktree(false);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--sb-bg-surface)",
          border: "1px solid var(--sb-border)",
          borderRadius: 8,
          padding: 24,
          width: 420,
          maxWidth: "90vw",
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--sb-text-primary)",
            marginBottom: 20,
          }}
        >
          New Session
        </h2>

        {/* Agent picker */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--sb-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              display: "block",
              marginBottom: 8,
            }}
          >
            Agent
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {AGENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAgent(a.id)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background:
                    agent === a.id
                      ? "var(--sb-bg-active)"
                      : "var(--sb-bg-primary)",
                  border: `1px solid ${agent === a.id ? "var(--sb-accent)" : "var(--sb-border)"}`,
                  borderRadius: 6,
                  color:
                    agent === a.id
                      ? "var(--sb-text-primary)"
                      : "var(--sb-text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>

        {/* Label */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--sb-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              display: "block",
              marginBottom: 8,
            }}
          >
            Session Label (optional)
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. auth-refactor"
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--sb-bg-terminal)",
              border: "1px solid var(--sb-border)",
              borderRadius: 6,
              color: "var(--sb-text-primary)",
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>

        {/* Task description */}
        {agent !== "bash" && (
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 11,
                color: "var(--sb-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "block",
                marginBottom: 8,
              }}
            >
              Initial Task (optional)
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what you want the agent to do..."
              rows={3}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--sb-bg-terminal)",
                border: "1px solid var(--sb-border)",
                borderRadius: 6,
                color: "var(--sb-text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>
        )}

        {/* Worktree toggle */}
        <div
          style={{
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            id="worktree"
            checked={useWorktree}
            onChange={(e) => setUseWorktree(e.target.checked)}
            style={{ accentColor: "var(--sb-accent)" }}
          />
          <label
            htmlFor="worktree"
            style={{
              fontSize: 12,
              color: "var(--sb-text-secondary)",
              cursor: "pointer",
            }}
          >
            Create isolated worktree for this session
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid var(--sb-border)",
              borderRadius: 6,
              color: "var(--sb-text-secondary)",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 16px",
              background: "var(--sb-accent)",
              border: "none",
              borderRadius: 6,
              color: "white",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}
