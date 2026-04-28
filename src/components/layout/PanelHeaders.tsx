import {
  ArrowDownToLine,
  FolderOpen,
  LayoutGrid,
  Loader2,
  PanelLeft,
  PanelRight,
  PanelTop,
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BranchPicker } from "@/components/git/BranchPicker";
import { WorktreePicker } from "@/components/git/WorktreePicker";
import type { GitState, GitActions } from "@/hooks/useGitState";
import type { StashEntry } from "@/lib/tauri-commands";

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
    | "stashApply"
    | "stashPop"
    | "stashDrop"
    | "stashShow"
  >;

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
        className="sb-window-control sb-window-control-close size-3 rounded-full bg-[#ff5f57] transition-all hover:brightness-90"
        aria-label="Close"
      />
      <button
        onClick={onMinimize}
        className="sb-window-control sb-window-control-minimize size-3 rounded-full bg-[#febc2e] transition-all hover:brightness-90"
        aria-label="Minimize"
      />
      <button
        onClick={onMaximize}
        className="sb-window-control sb-window-control-fullscreen size-3 rounded-full bg-[#28c840] transition-all hover:brightness-90"
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
      className="flex h-10 shrink-0 select-none items-center border-b bg-card/95 font-sans text-xs"
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
              className="size-7"
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
  projectPath?: string | null;
  cwd?: string | null;
  git?: GitWithActions;
  workspaceShellMode?: "pane" | "canvas";
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onWorkspaceShellModeChange?: (mode: "pane" | "canvas") => void;
  onCreateBranch?: (branchName?: string) => void;
  onCreateWorktree?: (label?: string) => void;
  onSelectWorktree?: (path: string) => void;
  onOpenStashDiff?: (stash: StashEntry) => void | Promise<void>;
  onOpenProjectFolder?: () => void;
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
  projectPath,
  cwd,
  git,
  workspaceShellMode = "pane",
  onClose,
  onMinimize,
  onMaximize,
  onToggleSidebar,
  onToggleInspector,
  onWorkspaceShellModeChange,
  onCreateBranch,
  onCreateWorktree,
  onSelectWorktree,
  onOpenStashDiff,
  onOpenProjectFolder,
  updateVersion = null,
  checkingForUpdates = false,
  installingUpdate = false,
  updateProgress = null,
  onInstallUpdate,
}: CenterPanelHeaderProps) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 select-none items-center gap-1 border-b bg-background px-2 font-sans text-xs"
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
                className="size-7"
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

      {projectPathLabel ? (
        <div className="flex min-w-0 items-center gap-1 text-xs">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-6 max-w-[160px] justify-start rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none hover:border-border hover:bg-card hover:text-foreground data-[state=open]:border-border data-[state=open]:bg-card data-[state=open]:text-foreground"
              >
                <span className="truncate">{projectPathLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem
                disabled={!onOpenProjectFolder}
                onSelect={() => onOpenProjectFolder?.()}
              >
                <FolderOpen className="size-3.5" />
                Open in Finder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-muted-foreground/50">/</span>
          <WorktreePicker
            projectPath={projectPath ?? null}
            currentPath={cwd ?? projectPath ?? null}
            currentBranch={git?.branch ?? null}
            onCreateWorktree={onCreateWorktree}
            onSelectPath={onSelectWorktree}
            triggerClassName="max-w-[190px]"
          />
          {git?.branch ? (
            <>
              <span className="text-muted-foreground/50">/</span>
              <BranchPicker
                branches={git.branches}
                loading={git.branchesLoading && git.branches.length === 0}
                value={git.branch}
                disabled={git.branchActionPending}
                triggerClassName="h-6 w-auto max-w-[190px] gap-1.5 border border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none hover:border-border hover:bg-card hover:text-foreground data-[state=open]:border-border data-[state=open]:bg-card data-[state=open]:text-foreground"
                createLabel="Create branch..."
                onSelect={(branchName) => void git.switchBranch(branchName)}
                onCreateBranch={onCreateBranch}
                stashes={git.stashes}
                stashesLoading={git.stashesLoading}
                onStashTabOpen={() => void git.refreshStashes()}
                onStashApply={(index) => git.stashApply(index)}
                onStashPop={(index) => git.stashPop(index)}
                onStashDrop={(index) => git.stashDrop(index)}
                onStashOpen={onOpenStashDiff}
                onStashView={(index) => git.stashShow(index)}
                compact
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div data-tauri-drag-region className="flex-1" />

      {projectPathLabel && (
        <>
          <div className="inline-flex items-center rounded-md border bg-card/70 p-0.5">
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
          <Separator orientation="vertical" className="mx-1 h-4" />
        </>
      )}

      {updateVersion && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1.5 px-2.5 text-xs"
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
              className="size-7"
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
  onToggleInspector: () => void;
}

export function RightPanelHeader({
  onToggleInspector,
}: RightPanelHeaderProps) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 select-none items-center gap-2 border-b bg-card/95 px-2 font-sans text-xs"
    >
      <div className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-muted-foreground">
        Inspector
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onToggleInspector}
          >
            <PanelRight className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hide Inspector (⌘G)</TooltipContent>
      </Tooltip>
    </div>
  );
}
