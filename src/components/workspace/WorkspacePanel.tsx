import { useState } from "react";
import { FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBranchPrefix } from "@/lib/branches";
import { useGitState } from "@/hooks/useGitState";
import { FilePanel } from "../files/FilePanel";
import { GitPanel } from "../git/GitPanel";
import { BranchPicker } from "../git/BranchPicker";
import { CreateBranchDialog } from "../git/CreateBranchDialog";
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
  session?: Session | null;
  githubToken?: string | null;
  onOpenSettings?: () => void;
  onSessionBranchChange?: (sessionId: string, branch: string | null) => Promise<void> | void;
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
  session,
  githubToken,
  onOpenSettings,
  onSessionBranchChange,
  onTabChange,
}: WorkspacePanelProps) {
  const [createBranchOpen, setCreateBranchOpen] = useState(false);

  const hasRoot = context?.availability === "ready" && !!context.rootPath;

  const git = useGitState({
    cwd: hasRoot ? context.rootPath! : "",
    visible: hasRoot,
    sessionId: context?.kind === "session" ? session?.id : null,
    onSessionBranchChange,
  });

  if (!context) return null;

  const rootKey = `${context.kind}:${context.source}:${context.rootPath ?? "missing"}`;
  const branchPrefix = context.kind === "session" && session?.agent
    ? getBranchPrefix(session.agent as AgentType)
    : undefined;

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
        git={git}
        githubToken={githubToken}
        onOpenSettings={onOpenSettings}
      />
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
      <div className="flex items-center border-b px-2">
        <div className="flex shrink-0">
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

        {/* Branch picker — flush right, always visible */}
        {hasRoot && (
          <div className="ml-auto min-w-0 max-w-[60%] pl-2">
            <BranchPicker
              branches={git.branches}
              loading={git.branchesLoading && git.branches.length === 0}
              value={git.branch}
              disabled={git.branchActionPending}
              triggerClassName="h-7 min-w-0 max-w-full justify-between gap-2 px-2 text-xs"
              createLabel="Create and checkout new branch..."
              onSelect={(branchName) => void git.switchBranch(branchName)}
              onCreateBranch={() => setCreateBranchOpen(true)}
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent(activeTab)}
      </div>

      {hasRoot && (
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
      )}
    </div>
  );
}
