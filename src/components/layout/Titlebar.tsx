import { useState, useEffect } from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  GitCommit,
  GitPullRequest,
  LayoutGrid,
  Loader2,
  PanelTop,
  PanelLeft,
  PanelRight,
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
  Pick<
    GitActions,
    | "switchBranch"
    | "createBranch"
    | "commit"
    | "stageAll"
    | "pull"
    | "push"
    | "fetch"
    | "refresh"
    | "refreshStashes"
    | "mergeBranch"
    | "deleteBranch"
    | "pushDeleteRemote"
    | "stashApply"
    | "stashPop"
    | "stashDrop"
    | "stashShow"
  >;

interface TitlebarProps {
  sidebarOpen: boolean;
  sidebarWidth?: number;
  inspectorOpen: boolean;
  workspaceShellMode?: "pane" | "canvas";
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onWorkspaceShellModeChange?: (mode: "pane" | "canvas") => void;
  projectPath?: string | null;
  hasActiveSession?: boolean;
  git?: GitWithActions;
  githubToken?: string | null;
  cwd?: string | null;
  onCreateBranch?: () => void;
  onCreatePr?: () => void;
  updateVersion?: string | null;
  checkingForUpdates?: boolean;
  installingUpdate?: boolean;
  updateProgress?: number | null;
  onInstallUpdate?: () => void;
}

export function Titlebar({
  sidebarOpen,
  sidebarWidth = 320,
  inspectorOpen,
  workspaceShellMode = "pane",
  onToggleSidebar,
  onToggleInspector,
  onWorkspaceShellModeChange,
  projectPath,
  hasActiveSession = false,
  git,
  onCreateBranch,
  onCreatePr,
  githubToken,
  updateVersion = null,
  checkingForUpdates = false,
  installingUpdate = false,
  updateProgress = null,
  onInstallUpdate,
  cwd,
}: TitlebarProps) {
  const appWindow = getCurrentWindow();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [pullPending, setPullPending] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [fetchPending, setFetchPending] = useState(false);
  const projectPathLabel = projectPath
    ? projectPath.split("/").slice(-2).join("/")
    : null;

  const hasChanges = (git?.files.length ?? 0) > 0;
  const canPush = (git?.aheadBehind.ahead ?? 0) > 0;
  const canPull = (git?.aheadBehind.behind ?? 0) > 0;
  const pushLabel = "Push";
  const anyGitPending = git?.branchActionPending || Boolean(git?.pendingAction) || pullPending || pushPending || fetchPending;

  const handlePull = () => {
    if (!git?.pull || pullPending || anyGitPending) return;
    window.setTimeout(async () => {
      flushSync(() => setPullPending(true));
      try { await git.pull(); } finally { setPullPending(false); }
    }, 0);
  };

  const handlePush = () => {
    if (!git?.push || pushPending || anyGitPending) return;
    window.setTimeout(async () => {
      flushSync(() => setPushPending(true));
      try { await git.push(); } finally { setPushPending(false); }
    }, 0);
  };

  const handleFetch = () => {
    if (!git?.fetch || fetchPending) return;
    window.setTimeout(async () => {
      setFetchPending(true);
      try { await git.fetch(); } finally { setFetchPending(false); }
    }, 0);
  };

  useEffect(() => {
    // Check initial fullscreen state
    void appWindow.isFullscreen().then(setIsFullscreen);

    // Listen for fullscreen changes (e.g. macOS native green button)
    const unlisten = appWindow.onResized(() => {
      void appWindow.isFullscreen().then(setIsFullscreen);
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [appWindow]);

  // Sync fullscreen state to a data attribute for CSS
  useEffect(() => {
    document.documentElement.dataset.fullscreen = isFullscreen
      ? "true"
      : "false";
    return () => {
      delete document.documentElement.dataset.fullscreen;
    };
  }, [isFullscreen]);

  const handleMaximize = async () => {
    const maximized = await appWindow.isMaximized();
    if (maximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 select-none items-center border-b bg-background font-sans text-xs"
    >
      {/* Left section — width matches sidebar so branch selector aligns with middle pane */}
      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center"
        style={{ width: sidebarOpen ? sidebarWidth : undefined }}
      >
        {/* Window controls — hidden in fullscreen */}
        {!isFullscreen && (
          <div className="flex items-center gap-1.5 pl-3 pr-2">
            <button
              onClick={() => appWindow.close()}
              className="sb-window-control sb-window-control-close size-3 rounded-full bg-[#ff5f57] hover:brightness-90 transition-all"
              aria-label="Close"
            />
            <button
              onClick={() => appWindow.minimize()}
              className="sb-window-control sb-window-control-minimize size-3 rounded-full bg-[#febc2e] hover:brightness-90 transition-all"
              aria-label="Minimize"
            />
            <button
              onClick={handleMaximize}
              className="sb-window-control sb-window-control-fullscreen size-3 rounded-full bg-[#28c840] hover:brightness-90 transition-all"
              aria-label="Fullscreen"
            />
          </div>
        )}

        {!isFullscreen && <Separator orientation="vertical" className="h-4" />}

        {/* Sidebar toggle */}
        <div className="flex items-center px-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={onToggleSidebar}
              >
                <PanelLeft className={sidebarOpen ? "size-4" : "size-4 opacity-40"} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Sidebar (⌘B)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Branch + git actions — show when project is open OR active session has git state */}
      {(projectPath || (hasActiveSession && git?.branch)) && git?.branch && (
        <div data-tauri-drag-region className="flex items-center gap-2 text-xs">
          <BranchPicker
            branches={git.branches}
            loading={git.branchesLoading && git.branches.length === 0}
            value={git.branch}
            disabled={git.branchActionPending}
            currentBranchUpstreamStatus={git.currentBranchUpstreamStatus}
            currentAheadBehind={git.aheadBehind}
            pendingAction={git.pendingAction}
            githubToken={githubToken}
            onFetch={git.fetch}
            onPull={git.pull}
            onPush={git.push}
            onCreatePr={onCreatePr}
            onMergeBranch={(branchName) => git.mergeBranch(branchName, "merge")}
            onSquashMergeBranch={(branchName) => git.mergeBranch(branchName, "squash")}
            onRebaseBranch={(branchName) => git.mergeBranch(branchName, "rebase")}
            onDeleteBranch={git.deleteBranch}
            onDeleteRemoteBranch={git.pushDeleteRemote}
            triggerClassName="h-6 w-auto max-w-[320px] gap-1.5 border-0 bg-transparent px-1 text-xs font-medium shadow-none hover:bg-muted/55"
            createLabel="Create branch..."
            onSelect={(branchName) => void git.switchBranch(branchName)}
            onCreateBranch={onCreateBranch}
            stashes={git.stashes}
            stashesLoading={git.stashesLoading}
            onStashTabOpen={() => void git.refreshStashes()}
            onStashApply={(index) => git.stashApply(index)}
            onStashPop={(index) => git.stashPop(index)}
            onStashDrop={(index) => git.stashDrop(index)}
            onStashView={(index) => git.stashShow(index)}
          />


          <Separator orientation="vertical" className="h-4" />

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
                    ? `${pushLabel === "Push" ? "Pushing" : "Publishing"}...`
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
                        <DropdownMenuItem disabled={!canPush} onSelect={handlePush}>
                          <ArrowUp className="size-3.5 mr-2" />
                          {pushLabel}
                        </DropdownMenuItem>
                      </span>
                    </TooltipTrigger>
                    {!canPush && (
                      <TooltipContent side="right">Nothing to {pushLabel.toLowerCase()}</TooltipContent>
                    )}
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <DropdownMenuItem disabled={!canPull} onSelect={handlePull}>
                          <ArrowDown className="size-3.5 mr-2" />
                          Pull
                        </DropdownMenuItem>
                      </span>
                    </TooltipTrigger>
                    {!canPull && (
                      <TooltipContent side="right">Already up to date</TooltipContent>
                    )}
                  </Tooltip>

                  <DropdownMenuItem onSelect={handleFetch}>
                    <RefreshCw className="size-3.5 mr-2" />
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
                          <GitPullRequest className="size-3.5 mr-2" />
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
        </div>
      )}

      {/* Commit dialog */}
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

      {/* Spacer — drag region */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Right controls */}
      <div data-tauri-drag-region className="flex items-center gap-1 px-2">
        {/* Pane / Canvas toggle */}
        {projectPathLabel ? (
          <>
            <div className="inline-flex items-center rounded-md border bg-background/80 p-0.5">
              <Button
                variant={workspaceShellMode === "pane" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 gap-1.5 px-2 text-xs"
                onClick={() => onWorkspaceShellModeChange?.("pane")}
              >
                <PanelTop className="size-3.5" />
                Pane
              </Button>
              <Button
                variant={workspaceShellMode === "canvas" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 gap-1.5 px-2 text-xs"
                onClick={() => onWorkspaceShellModeChange?.("canvas")}
              >
                <LayoutGrid className="size-3.5" />
                Canvas
              </Button>
            </div>
            <Separator orientation="vertical" className="h-4" />
          </>
        ) : null}

        {updateVersion && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-xs"
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
            <Separator orientation="vertical" className="h-4" />
          </>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={onToggleInspector}
            >
              <PanelRight
                className={inspectorOpen ? "size-4" : "size-4 opacity-40"}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Inspector (⌘G)</TooltipContent>
        </Tooltip>

      </div>
    </div>
  );
}
