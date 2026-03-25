interface DiffViewProps {
  diff: string;
}

/**
 * Renders a unified git diff with syntax coloring.
 * Green background for additions, red for deletions.
 */
export function DiffView({ diff }: DiffViewProps) {
  if (!diff.trim()) {
    return (
      <div style={{ padding: 12, color: "var(--sb-text-tertiary)", fontSize: 11 }}>
        No diff to show
      </div>
    );
  }

  const lines = diff.split("\n");

  return (
    <div
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        lineHeight: 1.5,
        borderTop: "1px solid var(--sb-border)",
      }}
    >
      {lines.map((line, i) => {
        let bg = "transparent";
        let color = "var(--sb-text-secondary)";

        if (line.startsWith("+++") || line.startsWith("---")) {
          color = "var(--sb-text-primary)";
        } else if (line.startsWith("@@")) {
          bg = "rgba(74, 74, 255, 0.1)";
          color = "var(--sb-accent)";
        } else if (line.startsWith("+")) {
          bg = "rgba(74, 222, 128, 0.1)";
          color = "var(--sb-diff-add)";
        } else if (line.startsWith("-")) {
          bg = "rgba(255, 107, 107, 0.1)";
          color = "var(--sb-diff-del)";
        } else if (line.startsWith("diff ")) {
          color = "var(--sb-text-primary)";
        }

        return (
          <div
            key={i}
            style={{
              padding: "0 12px",
              background: bg,
              color,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
