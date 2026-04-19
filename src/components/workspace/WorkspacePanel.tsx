import { FolderTree, RefreshCw, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilePanel } from "../files/FilePanel";
import { GitPanel } from "../git/GitPanel";
import { GitBranchSummary } from "../git/GitBranchSummary";
import type { GitState, GitActions } from "@/hooks/useGitState";
import type { Session } from "@/state/types";

export type WorkspaceTab = "files" | "changes";

export interface WorkspaceContext {
  sessionId?: string | null;
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
  /** Fallback path when no session is selected (project root) */
  projectPath?: string | null;
  git: GitState & GitActions;
  branchSessions?: Session[];
  githubToken?: string | null;
  onFileSelect?: (filePath: string) => void;
  onTabChange: (tab: WorkspaceTab) => void;
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
  projectPath,
  git,
  branchSessions = [],
  githubToken,
  onFileSelect,
  onTabChange,
}: WorkspacePanelProps) {
  const renderUnavailableState = (currentContext: WorkspaceContext, tab: WorkspaceTab) => {
    if (currentContext.availability === "resolving") {
      return (
        <EmptyWorkspaceState
          title="Resolving workspace"
          description="Switchboard is validating the selected session's workspace root."
        />
      );
    }

    if (currentContext.availability === "missing") {
      return (
        <EmptyWorkspaceState
          title={tab === "changes" ? "Cannot load changes" : "Workspace unavailable"}
          description={`Switchboard can still show ${currentContext.label}, but the saved workspace path is no longer available on disk.`}
          icon
        />
      );
    }

    if (!currentContext.rootPath) {
      return (
        <EmptyWorkspaceState
          title="No workspace selected"
          description="Open a project or select a session to inspect its workspace."
          icon
        />
      );
    }

    return null;
  };

  // Fall back to project root when no session is selected
  if (!context) {
    if (!projectPath) return null;
    const projectContext: WorkspaceContext = {
      sessionId: null,
      kind: "project",
      rootPath: projectPath,
      label: projectPath.split("/").pop() ?? projectPath,
      branch: null,
      availability: "ready",
      source: "project",
      isWorktree: false,
    };
    return (
      <WorkspacePanel
        activeTab={activeTab}
        context={projectContext}
        git={git}
        branchSessions={branchSessions}
        githubToken={githubToken}
        onFileSelect={onFileSelect}
        onTabChange={onTabChange}
      />
    );
  }

  const unavailableState = renderUnavailableState(context, activeTab);
  const changedFileCount = git.files.length;
  const isNotGitRepo =
    git.error !== null &&
    (git.error.includes("not a git repository") ||
      git.error.includes("needed a single revision"));
  const showGitStatusBar = Boolean(context.rootPath) && !isNotGitRepo;
  const branchLabel = git.branch || context.branch || "HEAD";
  const showPublishAction = git.currentBranchUpstreamStatus !== "tracking";

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
      <div className="border-b">
        {showGitStatusBar && (
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-[11px] text-muted-foreground">
            <GitBranchSummary
              branch={branchLabel}
              changedCount={changedFileCount}
              ahead={git.aheadBehind.ahead}
              behind={git.aheadBehind.behind}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 px-2 text-[11px]"
              onClick={() => {
                if (showPublishAction) {
                  void git.push();
                  return;
                }
                void git.fetch();
              }}
              disabled={git.branchActionPending}
            >
              {showPublishAction ? (
                <Upload className="size-3" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {showPublishAction ? "Publish" : "Fetch"}
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-1">
            {([
              { key: "files" as const, label: "Files" },
              { key: "changes" as const, label: "Changes" },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTab === tab.key
                    ? "border-border bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.key === "changes" && changedFileCount > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {changedFileCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content: full-height panel */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {unavailableState ? (
          unavailableState
        ) : (
          <>
            {activeTab === "files" ? (
              <FilePanel
                rootPath={context.rootPath!}
                onFileSelect={onFileSelect}
              />
            ) : null}

            {activeTab === "changes" ? (
              <GitPanel
                cwd={context.rootPath!}
                git={git}
                sessions={branchSessions}
                githubToken={githubToken}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
