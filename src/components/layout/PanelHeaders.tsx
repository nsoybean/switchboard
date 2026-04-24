import { useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  GitCommit,
  GitPullRequest,
  LayoutGrid,
  Loader2,
  PanelLeft,
  PanelRight,
  PanelTop,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { BranchPicker } from "@/components/git/BranchPicker";
import { CommitDialog } from "@/components/git/CommitDialog";
import type { GitState, GitActions } from "@/hooks/useGitState";

type GitWithActions = GitState &
  Pick<GitActions, "switchBranch" | "createBranch" | "commit" | "stageAll" | "pull" | "push" | "fetch" | "refresh">;

interface WindowControlsProps {
  isFullscreen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}

function WindowControls({ isFullscreen, onClose, onMinimize, onMaximize }: WindowControlsProps) {
  if (isFullscreen) return null;
  return (
    <div className="flex items-center gap-1.5 pl-3 pr-2">
      <button
        onClick={onClose}
        className="size-3 rounded-full bg-[#ff5f57] transition-all hover:brightness-90"
        aria-label="Close"
      />
      <button
        onClick={onMinimize}
        className="size-3 rounded-full bg-[#febc2e] transition-all hover:brightness-90"
        aria-label="Minimize"
      />
      <button
        onClick={onMaximize}
        className="size-3 rounded-full bg-[#28c840] transition-all hover:brightness-90"
        aria-label="Fullscreen"
      />
    </div>
  );
}

// ── Left Panel Header ────────────────────────────────────────────────────────

interface LeftPanelHeaderProps {
  isFullscreen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onToggleSidebar: () => void;
}

export function LeftPanelHeader({
  isFullscreen,
  onClose,
  onMinimize,
  onMaximize,
  onToggleSidebar,
}: LeftPanelHeaderProps) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-[46px] shrink-0 select-none items-center "
    >
      <WindowControls
        isFullscreen={isFullscreen}
        onClose={onClose}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
      />
      {!isFullscreen && <Separator orientation="vertical" className="h-4" />}
      <div className="px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={onToggleSidebar}
            >
              <PanelLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Hide Sidebar (⌘B)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ── Center Panel Header ──────────────────────────────────────────────────────

interface CenterPanelHeaderProps {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  isFullscreen: boolean;
  projectPathLabel?: string | null;
  workspaceShellMode?: "pane" | "canvas";
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onWorkspaceShellModeChange?: (mode: "pane" | "canvas") => void;
  updateVersion?: string | null;
  checkingForUpdates?: boolean;
  installingUpdate?: boolean;
  updateProgress?: number | null;
  onInstallUpdate?: () => void;
}

export function CenterPanelHeader({
  sidebarOpen,
  inspectorOpen,
  isFullscreen,
  projectPathLabel,
  workspaceShellMode = "pane",
  onClose,
  onMinimize,
  onMaximize,
  onToggleSidebar,
  onToggleInspector,
  onWorkspaceShellModeChange,
  updateVersion = null,
  checkingForUpdates = false,
  installingUpdate = false,
  updateProgress = null,
  onInstallUpdate,
}: CenterPanelHeaderProps) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-[46px] shrink-0 select-none items-center gap-1 bg-card px-2"
    >
      {/* Window controls + sidebar toggle appear here when sidebar is hidden */}
      {!sidebarOpen && (
        <>
          <WindowControls
            isFullscreen={isFullscreen}
            onClose={onClose}
            onMinimize={onMinimize}
            onMaximize={onMaximize}
          />
          {!isFullscreen && <Separator orientation="vertical" className="mx-1 h-4" />}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={onToggleSidebar}
              >
                <PanelLeft className="size-4 opacity-40" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show Sidebar (⌘B)</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 h-4" />
        </>
      )}

      <div data-tauri-drag-region className="flex-1" />

      {projectPathLabel && (
        <>
          <div className="inline-flex items-center rounded-md border bg-background/80 p-0.5">
            <Button
              variant={workspaceShellMode === "pane" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1.5 px-2 text-[11px]"
              onClick={() => onWorkspaceShellModeChange?.("pane")}
            >
              <PanelTop className="size-3.5" />
              Pane
            </Button>
            <Button
              variant={workspaceShellMode === "canvas" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1.5 px-2 text-[11px]"
              onClick={() => onWorkspaceShellModeChange?.("canvas")}
            >
              <LayoutGrid className="size-3.5" />
              Canvas
            </Button>
          </div>
          <Separator orientation="vertical" className="mx-1 h-4" />
        </>
      )}

      {updateVersion && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-3 text-xs"
            onClick={onInstallUpdate}
            disabled={checkingForUpdates || installingUpdate}
          >
            {installingUpdate ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowDownToLine className="size-4" />
            )}
            {installingUpdate && updateProgress !== null
              ? `Updating ${updateProgress}%`
              : `Update ${updateVersion}`}
          </Button>
          <Separator orientation="vertical" className="mx-1 h-4" />
        </>
      )}

      {!inspectorOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={onToggleInspector}
            >
              <PanelRight className="size-4 opacity-40" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Show Inspector (⌘G)</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ── Right Panel Header ───────────────────────────────────────────────────────

interface RightPanelHeaderProps {
  git?: GitWithActions;
  githubToken?: string | null;
  cwd?: string | null;
  onCreateBranch?: () => void;
  onCreatePr?: () => void;
  onToggleInspector: () => void;
}

export function RightPanelHeader({
  git,
  githubToken,
  cwd,
  onCreateBranch,
  onCreatePr,
  onToggleInspector,
}: RightPanelHeaderProps) {
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [pullPending, setPullPending] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [fetchPending, setFetchPending] = useState(false);

  const hasChanges = (git?.files.length ?? 0) > 0;
  const canPush = (git?.aheadBehind.ahead ?? 0) > 0;
  const canPull = (git?.aheadBehind.behind ?? 0) > 0;
  const anyGitPending =
    git?.branchActionPending || pullPending || pushPending || fetchPending;

  const handlePull = () => {
    if (!git?.pull || pullPending || anyGitPending) return;
    window.setTimeout(async () => {
      flushSync(() => setPullPending(true));
      try {
        await git.pull();
      } finally {
        setPullPending(false);
      }
    }, 0);
  };

  const handlePush = () => {
    if (!git?.push || pushPending || anyGitPending) return;
    window.setTimeout(async () => {
      flushSync(() => setPushPending(true));
      try {
        await git.push();
      } finally {
        setPushPending(false);
      }
    }, 0);
  };

  const handleFetch = () => {
    if (!git?.fetch || fetchPending) return;
    window.setTimeout(async () => {
      setFetchPending(true);
      try {
        await git.fetch();
      } finally {
        setFetchPending(false);
      }
    }, 0);
  };

  return (
    <>
      <div
        data-tauri-drag-region
        className="flex h-[46px] shrink-0 select-none items-center gap-2  px-2"
      >
        {git?.branch && (
          <>
            {/* Branch selector — bordered pill */}
            <BranchPicker
              branches={git.branches}
              loading={git.branchesLoading && git.branches.length === 0}
              value={git.branch}
              disabled={git.branchActionPending}
              triggerClassName="h-7 w-auto max-w-[180px] gap-1.5 border bg-background px-2 text-xs font-medium shadow-none hover:bg-accent/50"
              createLabel="Create branch..."
              onSelect={(branchName) => void git.switchBranch(branchName)}
              onCreateBranch={onCreateBranch}
            />

            {/* Split commit button */}
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 rounded-r-none border-r-0 px-2.5 text-xs font-medium"
                    disabled={!hasChanges || !!anyGitPending}
                    onClick={() => setCommitDialogOpen(true)}
                  >
                    {anyGitPending ? (
                      <Spinner className="size-3" />
                    ) : (
                      <GitCommit className="size-3.5" />
                    )}
                    {pullPending
                      ? "Pulling..."
                      : pushPending
                        ? "Pushing..."
                        : fetchPending
                          ? "Fetching..."
                          : "Commit"}
                  </Button>
                </TooltipTrigger>
                {!hasChanges && (
                  <TooltipContent>No changes to commit</TooltipContent>
                )}
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-l-none px-1.5 text-xs"
                    disabled={!!anyGitPending}
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuGroup>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <DropdownMenuItem
                            disabled={!hasChanges}
                            onSelect={() => setCommitDialogOpen(true)}
                          >
                            <GitCommit className="mr-2 size-3.5" />
                            Commit
                          </DropdownMenuItem>
                        </span>
                      </TooltipTrigger>
                      {!hasChanges && (
                        <TooltipContent side="right">No changes to commit</TooltipContent>
                      )}
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <DropdownMenuItem disabled={!canPush} onSelect={handlePush}>
                            <ArrowUp className="mr-2 size-3.5" />
                            Push
                          </DropdownMenuItem>
                        </span>
                      </TooltipTrigger>
                      {!canPush && (
                        <TooltipContent side="right">Nothing to push</TooltipContent>
                      )}
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <DropdownMenuItem disabled={!canPull} onSelect={handlePull}>
                            <ArrowDown className="mr-2 size-3.5" />
                            Pull
                          </DropdownMenuItem>
                        </span>
                      </TooltipTrigger>
                      {!canPull && (
                        <TooltipContent side="right">Already up to date</TooltipContent>
                      )}
                    </Tooltip>

                    <DropdownMenuItem onSelect={handleFetch}>
                      <RefreshCw className="mr-2 size-3.5" />
                      Fetch
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuGroup>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <DropdownMenuItem
                            disabled={!githubToken}
                            onSelect={() => { if (githubToken) onCreatePr?.(); }}
                          >
                            <GitPullRequest className="mr-2 size-3.5" />
                            Create PR
                          </DropdownMenuItem>
                        </span>
                      </TooltipTrigger>
                      {!githubToken && (
                        <TooltipContent side="right">
                          Add a GitHub token in Settings to create PRs
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        <div data-tauri-drag-region className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={onToggleInspector}
            >
              <PanelRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Hide Inspector (⌘G)</TooltipContent>
        </Tooltip>
      </div>

      {git && cwd && (
        <CommitDialog
          open={commitDialogOpen}
          onClose={() => setCommitDialogOpen(false)}
          branch={git.branch}
          files={git.files}
          additions={git.stats.additions}
          deletions={git.stats.deletions}
          cwd={cwd}
          githubToken={githubToken ?? null}
          branchActionPending={git.branchActionPending}
          onCommit={git.commit}
          onStageAll={git.stageAll}
          onPush={git.push}
        />
      )}
    </>
  );
}
