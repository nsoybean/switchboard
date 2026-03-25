import { useState } from "react";
import type { DiffStats } from "../../lib/tauri-commands";

interface GitToolbarProps {
  branch: string;
  stats: DiffStats;
  onCommit: (message: string) => Promise<void>;
  onPush: () => Promise<void>;
  onRefresh: () => void;
}

export function GitToolbar({
  branch,
  stats,
  onCommit,
  onPush,
  onRefresh,
}: GitToolbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    await onCommit(commitMsg.trim());
    setCommitMsg("");
    setCommitOpen(false);
  };

  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--sb-border)",
      }}
    >
      {/* Branch + stats */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--sb-accent)" }}>
          {branch || "—"}
        </span>
        <span style={{ fontSize: 11 }}>
          <span style={{ color: "var(--sb-diff-add)" }}>+{stats.additions}</span>{" "}
          <span style={{ color: "var(--sb-diff-del)" }}>-{stats.deletions}</span>{" "}
          <span style={{ color: "var(--sb-text-tertiary)" }}>
            {stats.files_changed} files
          </span>
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, position: "relative" }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            flex: 1,
            padding: "6px 8px",
            fontSize: 11,
            background: "var(--sb-accent)",
            border: "none",
            borderRadius: 4,
            color: "white",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Commit ▾
        </button>
        <button
          onClick={onRefresh}
          style={{
            padding: "6px 8px",
            fontSize: 11,
            background: "var(--sb-bg-primary)",
            border: "1px solid var(--sb-border)",
            borderRadius: 4,
            color: "var(--sb-text-secondary)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          title="Refresh"
        >
          ↻
        </button>

        {/* Dropdown */}
        {dropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              background: "var(--sb-bg-primary)",
              border: "1px solid var(--sb-border)",
              borderRadius: 6,
              overflow: "hidden",
              zIndex: 50,
            }}
          >
            {[
              {
                label: "Commit",
                action: () => {
                  setCommitOpen(true);
                  setDropdownOpen(false);
                },
              },
              {
                label: "Push",
                action: async () => {
                  await onPush();
                  setDropdownOpen(false);
                },
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 11,
                  background: "transparent",
                  border: "none",
                  color: "var(--sb-text-primary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--sb-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Commit dialog inline */}
      {commitOpen && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleCommit();
              }
              if (e.key === "Escape") {
                setCommitOpen(false);
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              background: "var(--sb-bg-terminal)",
              border: "1px solid var(--sb-border)",
              borderRadius: 4,
              color: "var(--sb-text-primary)",
              fontSize: 12,
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div
            style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}
          >
            <button
              onClick={() => setCommitOpen(false)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: "transparent",
                border: "1px solid var(--sb-border)",
                borderRadius: 4,
                color: "var(--sb-text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: "var(--sb-accent)",
                border: "none",
                borderRadius: 4,
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Commit (⌘↵)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
