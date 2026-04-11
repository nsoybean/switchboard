import { useState } from "react";
import { FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilePanel } from "../files/FilePanel";
import { GitPanel } from "../git/GitPanel";
import { CreateBranchDialog } from "../git/CreateBranchDialog";
import { getBranchPrefix } from "@/lib/branches";
import type { GitState, GitActions } from "@/hooks/useGitState";
import type { Session } from "../../state/types";
import type { AgentType } from "../../state/types";

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
  git: GitState & GitActions;
  session?: Session | null;
  githubToken?: string | null;
  onOpenSettings?: (tab?: "general" | "integrations" | "about") => void;
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
  git,
  session,
  githubToken,
  onOpenSettings,
  onFileSelect,
  onTabChange,
}: WorkspacePanelProps) {
  const [createBranchOpen, setCreateBranchOpen] = useState(false);

  const hasRoot = context?.availability === "ready" && !!context.rootPath;
  const branchPrefix = context?.kind === "session" && session?.agent
    ? getBranchPrefix(session.agent as AgentType)
    : undefined;

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

  if (!context) {
    return null;
  }

  const unavailableState = renderUnavailableState(context, activeTab);
  const changedFileCount = git.files.length;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
      {/* Header: tabs */}
      <div className="flex items-center justify-between border-b px-2 py-2">
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
                githubToken={githubToken}
                onOpenSettings={onOpenSettings}
              />
            ) : null}
          </>
        )}
      </div>

      {hasRoot ? (
        <CreateBranchDialog
          open={createBranchOpen}
          onOpenChange={setCreateBranchOpen}
          defaultBranchPrefix={branchPrefix}
          pending={git.branchActionPending}
          onCreate={async (branchName) => {
            await git.createBranch(branchName);
            setCreateBranchOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
