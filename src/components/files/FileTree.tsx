import { useState, useCallback } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileCommands, type FileEntry } from "../../lib/tauri-commands";

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
}

function FileTreeNode({ entry, depth }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!entry.is_dir) return;
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (children === null) {
      setLoading(true);
      try {
        const result = await fileCommands.listDirectory(entry.path);
        setChildren(result);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  }, [entry, expanded, children]);

  const FolderIcon = expanded ? FolderOpen : Folder;

  return (
    <div>
      <button
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-1.5 w-full text-left py-1 pr-2 text-xs hover:bg-accent/50 transition-colors",
          entry.is_dir ? "cursor-pointer" : "cursor-default",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {entry.is_dir ? (
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-transform text-muted-foreground",
              expanded && "rotate-90",
            )}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        {entry.is_dir ? (
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-mono">{entry.name}</span>
        {!entry.is_dir && entry.size !== null && (
          <span className="ml-auto text-[10px] text-muted-foreground/50 shrink-0">
            {formatSize(entry.size)}
          </span>
        )}
      </button>

      {expanded && loading && (
        <div
          className="text-[10px] text-muted-foreground py-1"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          Loading...
        </div>
      )}

      {expanded &&
        children?.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

interface FileTreeProps {
  rootPath: string;
}

export function FileTree({ rootPath }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load root entries on first render
  useState(() => {
    if (!rootPath) return;
    setLoading(true);
    fileCommands
      .listDirectory(rootPath)
      .then((result) => {
        setEntries(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  });

  if (error) {
    return (
      <div className="p-3 text-xs text-destructive">{error}</div>
    );
  }

  if (loading || entries === null) {
    return (
      <div className="p-3 text-xs text-muted-foreground">Loading files...</div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">No files found.</div>
    );
  }

  return (
    <div className="py-1">
      {entries.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} depth={0} />
      ))}
    </div>
  );
}
