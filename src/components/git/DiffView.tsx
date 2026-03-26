import { cn } from "@/lib/utils";

interface DiffViewProps {
  diff: string;
}

export function DiffView({ diff }: DiffViewProps) {
  if (!diff.trim()) {
    return (
      <div className="p-3 text-xs text-muted-foreground">No diff to show</div>
    );
  }

  const lines = diff.split("\n");

  return (
    <div className="font-mono text-[11px] leading-relaxed border-t">
      {lines.map((line, i) => {
        const isAdd = line.startsWith("+") && !line.startsWith("+++");
        const isDel = line.startsWith("-") && !line.startsWith("---");
        const isHunk = line.startsWith("@@");
        const isHeader = line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ");

        return (
          <div
            key={i}
            className={cn(
              "px-3 whitespace-pre-wrap break-all",
              isAdd && "bg-[var(--sb-diff-add-bg)] text-[var(--sb-diff-add-fg)]",
              isDel && "bg-[var(--sb-diff-del-bg)] text-[var(--sb-diff-del-fg)]",
              isHunk && "bg-accent/30 text-primary",
              isHeader && "text-foreground font-medium",
              !isAdd && !isDel && !isHunk && !isHeader && "text-muted-foreground",
            )}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
