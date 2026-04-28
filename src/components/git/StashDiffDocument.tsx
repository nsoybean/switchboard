import { Archive, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DiffView } from "./DiffView";

export interface StashDiffDocumentData {
  id: string;
  refName: string;
  message: string;
  date: string;
  diff: string;
}

interface StashDiffFile {
  key: string;
  name: string;
  directory: string;
  additions: number;
  deletions: number;
  diff: string;
}

interface StashDiffDocumentProps {
  stash: StashDiffDocumentData;
}

export function StashDiffDocument({ stash }: StashDiffDocumentProps) {
  const files = parseStashDiff(stash.diff);
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-w-0 items-center gap-2 border-b bg-card px-3 py-2">
        <Archive className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={stash.message}>
            {stash.message}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{stash.refName}</span>
            <span>·</span>
            <span>{stash.date}</span>
          </div>
        </div>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {files.length} {files.length === 1 ? "file" : "files"}
        </Badge>
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums">
          {totalAdditions > 0 ? (
            <span className="text-[var(--sb-diff-add-fg)]">+{totalAdditions}</span>
          ) : null}
          {totalDeletions > 0 ? (
            <span className="text-[var(--sb-diff-del-fg)]">-{totalDeletions}</span>
          ) : null}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {files.length > 0 ? (
          <div className="flex flex-col gap-2">
            {files.map((file) => (
              <div key={file.key} className="overflow-hidden rounded-md border bg-background">
                <div className="flex min-w-0 items-center gap-2 border-b bg-card px-2 py-1.5 text-xs">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate font-mono font-medium text-foreground" title={file.key}>
                    {file.name}
                  </span>
                  {file.directory ? (
                    <span className="min-w-0 truncate font-mono text-muted-foreground">
                      {file.directory}
                    </span>
                  ) : null}
                  <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
                    {file.additions > 0 ? (
                      <span className="text-[var(--sb-diff-add-fg)]">+{file.additions}</span>
                    ) : null}
                    {file.deletions > 0 ? (
                      <span className="text-[var(--sb-diff-del-fg)]">-{file.deletions}</span>
                    ) : null}
                  </span>
                </div>
                <DiffView diff={file.diff} />
              </div>
            ))}
          </div>
        ) : (
          <DiffView diff={stash.diff} />
        )}
      </div>
    </div>
  );
}

function parseStashDiff(diff: string): StashDiffFile[] {
  const lines = diff.split("\n");
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) {
        sections.push(current);
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections.map((section, index) => {
    const key = getDiffPath(section[0]) ?? `File ${index + 1}`;
    const slashIndex = key.lastIndexOf("/");
    const name = slashIndex >= 0 ? key.slice(slashIndex + 1) : key;
    const directory = slashIndex >= 0 ? `${key.slice(0, slashIndex)}/` : "";
    let additions = 0;
    let deletions = 0;

    for (const line of section) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
      if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    }

    return {
      key,
      name,
      directory,
      additions,
      deletions,
      diff: section.join("\n"),
    };
  });
}

function getDiffPath(header: string) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(header);
  if (!match) return null;
  return match[2] || match[1] || null;
}
