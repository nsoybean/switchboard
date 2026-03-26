import { useEffect, useState } from "react";
import { File, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileCommands } from "../../lib/tauri-commands";

interface FilePreviewProps {
  filePath: string;
  onClose: () => void;
}

/** Simple extension-based language hint for styling */
function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    json: "json",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    css: "css",
    html: "html",
    sh: "shell",
    bash: "shell",
  };
  return map[ext] ?? "text";
}

export function FilePreview({ filePath, onClose }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fileName = filePath.split("/").pop() ?? filePath;
  const language = getLanguage(filePath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);

    fileCommands
      .readFile(filePath)
      .then((data) => {
        if (!cancelled) {
          setContent(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card shrink-0">
        <File className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium truncate flex-1 font-mono">
          {fileName}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{language}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && (
          <div className="p-4 text-xs text-muted-foreground">Loading...</div>
        )}
        {error && (
          <div className="p-4 text-xs text-destructive">{error}</div>
        )}
        {content !== null && (
          <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
            {content.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="inline-block w-10 shrink-0 text-right pr-4 text-muted-foreground/40 select-none">
                  {i + 1}
                </span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
