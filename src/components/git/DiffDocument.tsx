import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fileCommands, gitCommands } from "@/lib/tauri-commands";
import { DiffView } from "./DiffView";

interface DiffDocumentProps {
  cwd: string;
  path: string;
  staged: boolean;
  status?: string;
}

export function DiffDocument({
  cwd,
  path,
  staged,
  status,
}: DiffDocumentProps) {
  const [diff, setDiff] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDiff() {
      setLoading(true);
      setError(null);

      try {
        if (status === "??" && !staged) {
          const filePath = `${cwd.replace(/\/$/, "")}/${path}`;
          const contents = await fileCommands.readFile(filePath);
          if (cancelled) return;
          const syntheticDiff = contents
            .split("\n")
            .map((line) => `+${line}`)
            .join("\n");
          setDiff(syntheticDiff);
          setLoading(false);
          return;
        }

        const nextDiff = await gitCommands.diff(cwd, path, staged);
        if (cancelled) return;
        setDiff(nextDiff);
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
        setDiff("");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDiff();

    return () => {
      cancelled = true;
    };
  }, [cwd, path, staged, status]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
          {path}
        </span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
          {staged ? "Staged" : "Unstaged"}
        </Badge>
        {status ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono">
            {status}
          </Badge>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-xs text-muted-foreground">Loading diff...</div>
        ) : error ? (
          <div className="p-4 text-xs text-destructive">{error}</div>
        ) : (
          <DiffView diff={diff} />
        )}
      </div>
    </div>
  );
}
