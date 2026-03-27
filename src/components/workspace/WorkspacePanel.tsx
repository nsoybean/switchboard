import { FolderTree, GitBranch, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FilePanel } from "../files/FilePanel";
import { GitPanel } from "../git/GitPanel";

export type WorkspaceTab = "files" | "changes";

export interface WorkspaceContext {
  kind: "project" | "session";
  rootPath: string | null;
  label: string;
  branch: string | null;
  availability: "resolving" | "ready" | "missing";
  source: "project" | "cwd" | "worktreePath" | "history";
  isWorktree: boolean;
}

interface WorkspacePanelProps {
  activeTab: WorkspaceTab;
  context: WorkspaceContext | null;
  githubToken?: string | null;
  onOpenSettings?: () => void;
  onTabChange: (tab: WorkspaceTab) => void;
}

function getSubtitle(context: WorkspaceContext): string {
  if (context.availability === "missing") return "Workspace unavailable";
  if (context.source === "worktreePath") return "Worktree root";
  if (context.source === "project") return "Project root";
  return "Launch root";
}

function EmptyWorkspaceState({
  title,
  description,
  icon = false,
}: {
  title: string;
  description: string;
  icon?: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex max-w-xs flex-col items-center gap-2 text-center">
        {icon ? <FolderTree className="size-4 text-muted-foreground" /> : null}
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function WorkspacePanel({
  activeTab,
  context,
  githubToken,
  onOpenSettings,
  onTabChange,
}: WorkspacePanelProps) {
  if (!context) return null;

  const canInspect = context.availability === "ready" && !!context.rootPath;
  const rootKey = `${context.kind}:${context.source}:${context.rootPath ?? "missing"}`;

  const renderContent = (tab: WorkspaceTab) => {
    if (context.availability === "resolving") {
      return (
        <EmptyWorkspaceState
          title="Resolving workspace"
          description="Switchboard is validating the selected session's workspace root."
          icon={false}
        />
      );
    }

    if (context.availability === "missing") {
      return (
        <EmptyWorkspaceState
          title={tab === "files" ? "Workspace unavailable" : "Cannot load changes"}
          description={`Switchboard can still show ${context.label}, but the saved workspace path is no longer available on disk.`}
          icon
        />
      );
    }

    if (!context.rootPath) {
      return (
        <EmptyWorkspaceState
          title="No workspace selected"
          description="Open a project or select a session to inspect its workspace."
          icon
        />
      );
    }

    if (tab === "files") {
      return <FilePanel key={`files:${rootKey}`} rootPath={context.rootPath} />;
    }

    return (
      <GitPanel
        key={`changes:${rootKey}`}
        cwd={context.rootPath}
        visible
        githubToken={githubToken}
        onOpenSettings={onOpenSettings}
      />
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={context.label}>
              {context.label}
            </p>
            <p className="text-[11px] text-muted-foreground">{getSubtitle(context)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {context.branch ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <GitBranch />
                {context.branch}
              </Badge>
            ) : null}
            {context.isWorktree ? (
              <Badge variant="secondary" className="text-[10px]">
                Worktree
              </Badge>
            ) : null}
          </div>
        </div>

        {canInspect ? (
          <p
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={context.rootPath ?? undefined}
          >
            {context.rootPath}
          </p>
        ) : context.availability === "missing" ? (
          <p className="text-[11px] text-muted-foreground">Saved workspace path unavailable</p>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Validating workspace root
          </p>
        )}
      </div>

      <div className="flex border-b px-2">
        {(["files", "changes"] as WorkspaceTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "files" ? "Files" : "Changes"}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent(activeTab)}
      </div>
    </div>
  );
}
