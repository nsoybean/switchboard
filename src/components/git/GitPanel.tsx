import { useCallback, useEffect, useState } from "react";
import { gitCommands, type ChangedFile, type DiffStats } from "../../lib/tauri-commands";
import { GitToolbar } from "./GitToolbar";
import { DiffView } from "./DiffView";

interface GitPanelProps {
  cwd: string;
  visible: boolean;
}

export function GitPanel({ cwd, visible }: GitPanelProps) {
  const [branch, setBranch] = useState("");
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [stats, setStats] = useState<DiffStats>({ additions: 0, deletions: 0, files_changed: 0 });
  const [diff, setDiff] = useState("");
  const [showStaged, setShowStaged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await gitCommands.status(cwd);
      setBranch(status.branch);
      setFiles(status.files);
      setStats(status.stats);

      const diffText = await gitCommands.diff(cwd, undefined, showStaged);
      setDiff(diffText);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd, showStaged]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!visible) return;
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [visible, refresh]);

  const handleStageAll = async () => {
    const unstaged = files.filter((f) => !f.staged).map((f) => f.path);
    if (unstaged.length === 0) return;
    await gitCommands.stage(cwd, unstaged);
    refresh();
  };

  const handleRevertAll = async () => {
    const unstaged = files.filter((f) => !f.staged && f.status !== "??").map((f) => f.path);
    if (unstaged.length === 0) return;
    await gitCommands.revert(cwd, unstaged);
    refresh();
  };

  const handleStageFile = async (path: string) => {
    await gitCommands.stage(cwd, [path]);
    refresh();
  };

  const handleUnstageFile = async (path: string) => {
    await gitCommands.unstage(cwd, [path]);
    refresh();
  };

  const handleRevertFile = async (path: string) => {
    await gitCommands.revert(cwd, [path]);
    refresh();
  };

  const handleCommit = async (message: string) => {
    await gitCommands.commit(cwd, message);
    refresh();
  };

  const handlePush = async () => {
    await gitCommands.push(cwd);
    refresh();
  };

  if (!visible) return null;

  const filteredFiles = showStaged
    ? files.filter((f) => f.staged)
    : files.filter((f) => !f.staged);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 280,
        minWidth: 280,
        background: "var(--sb-bg-surface)",
        borderLeft: "1px solid var(--sb-border)",
      }}
    >
      {/* Toolbar */}
      <GitToolbar
        branch={branch}
        stats={stats}
        onCommit={handleCommit}
        onPush={handlePush}
        onRefresh={refresh}
      />

      {/* Staged/Unstaged toggle */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--sb-border)",
        }}
      >
        <button
          onClick={() => setShowStaged(false)}
          style={{
            flex: 1,
            padding: "6px 0",
            fontSize: 11,
            border: "none",
            borderBottom: showStaged ? "none" : "2px solid var(--sb-accent)",
            background: "transparent",
            color: showStaged ? "var(--sb-text-tertiary)" : "var(--sb-text-primary)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Unstaged ({files.filter((f) => !f.staged).length})
        </button>
        <button
          onClick={() => setShowStaged(true)}
          style={{
            flex: 1,
            padding: "6px 0",
            fontSize: 11,
            border: "none",
            borderBottom: showStaged ? "2px solid var(--sb-accent)" : "none",
            background: "transparent",
            color: showStaged ? "var(--sb-text-primary)" : "var(--sb-text-tertiary)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Staged ({files.filter((f) => f.staged).length})
        </button>
      </div>

      {/* File list + diff */}
      <div className="flex-1 overflow-y-auto" style={{ fontSize: 12 }}>
        {error && (
          <div style={{ padding: 12, color: "var(--sb-status-error)", fontSize: 11 }}>
            {error}
          </div>
        )}
        {loading && filteredFiles.length === 0 && (
          <div style={{ padding: 12, color: "var(--sb-text-tertiary)", fontSize: 11 }}>
            Loading...
          </div>
        )}
        {!loading && filteredFiles.length === 0 && !error && (
          <div style={{ padding: 12, color: "var(--sb-text-tertiary)", fontSize: 11 }}>
            {showStaged ? "No staged changes" : "No unstaged changes"}
          </div>
        )}

        {/* Changed files */}
        {filteredFiles.map((file) => (
          <div
            key={`${file.path}-${file.staged}`}
            style={{
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--sb-border)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                padding: "1px 4px",
                borderRadius: 3,
                background:
                  file.status === "A" || file.status === "??"
                    ? "#1a3320"
                    : file.status === "D"
                      ? "#331a1a"
                      : "#332b1a",
                color:
                  file.status === "A" || file.status === "??"
                    ? "var(--sb-diff-add)"
                    : file.status === "D"
                      ? "var(--sb-diff-del)"
                      : "var(--sb-status-waiting)",
              }}
            >
              {file.status}
            </span>
            <span
              className="flex-1"
              style={{
                color: "var(--sb-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.path}
            </span>
            {/* Action buttons */}
            {showStaged ? (
              <button
                onClick={() => handleUnstageFile(file.path)}
                style={{
                  fontSize: 10,
                  color: "var(--sb-text-tertiary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                title="Unstage"
              >
                −
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleStageFile(file.path)}
                  style={{
                    fontSize: 10,
                    color: "var(--sb-diff-add)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  title="Stage"
                >
                  +
                </button>
                {file.status !== "??" && (
                  <button
                    onClick={() => handleRevertFile(file.path)}
                    style={{
                      fontSize: 10,
                      color: "var(--sb-status-error)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    title="Revert"
                  >
                    ↩
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        {/* Diff preview */}
        {diff && <DiffView diff={diff} />}
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          display: "flex",
          borderTop: "1px solid var(--sb-border)",
          padding: 8,
          gap: 8,
        }}
      >
        <button
          onClick={handleRevertAll}
          style={{
            flex: 1,
            padding: "6px 0",
            fontSize: 11,
            background: "transparent",
            border: "1px solid var(--sb-border)",
            borderRadius: 4,
            color: "var(--sb-text-secondary)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ↩ Revert all
        </button>
        <button
          onClick={handleStageAll}
          style={{
            flex: 1,
            padding: "6px 0",
            fontSize: 11,
            background: "var(--sb-accent)",
            border: "none",
            borderRadius: 4,
            color: "white",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Stage all
        </button>
      </div>
    </div>
  );
}
