import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDownToLine,
  History,
  LayoutGrid,
  Loader2,
  PanelTop,
  PanelLeft,
  PanelRight,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";

interface TitlebarProps {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  workspaceShellMode?: "pane" | "canvas";
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onWorkspaceShellModeChange?: (mode: "pane" | "canvas") => void;
  projectPath?: string | null;
  onProjectClick?: () => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  updateVersion?: string | null;
  checkingForUpdates?: boolean;
  installingUpdate?: boolean;
  updateProgress?: number | null;
  onInstallUpdate?: () => void;
}

export function Titlebar({
  sidebarOpen,
  inspectorOpen,
  workspaceShellMode = "pane",
  onToggleSidebar,
  onToggleInspector,
  onWorkspaceShellModeChange,
  projectPath,
  onProjectClick,
  onOpenHistory,
  onOpenSettings,
  updateVersion = null,
  checkingForUpdates = false,
  installingUpdate = false,
  updateProgress = null,
  onInstallUpdate,
}: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const appWindow = getCurrentWindow();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const projectPathLabel = projectPath
    ? projectPath.split("/").slice(-2).join("/")
    : null;

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
    const fullscreen = await appWindow.isFullscreen();
    if (fullscreen) {
      await appWindow.setFullscreen(false);
      setIsFullscreen(false);
    } else {
      await appWindow.setFullscreen(true);
      setIsFullscreen(true);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center h-[52px] border-b bg-background select-none shrink-0"
    >
      {/* Window controls — hidden in fullscreen */}
      {!isFullscreen && (
        <div className="flex items-center gap-1.5 pl-3 pr-2">
          <button
            onClick={() => appWindow.close()}
            className="size-3 rounded-full bg-[#ff5f57] hover:brightness-90 transition-all"
            aria-label="Close"
          />
          <button
            onClick={() => appWindow.minimize()}
            className="size-3 rounded-full bg-[#febc2e] hover:brightness-90 transition-all"
            aria-label="Minimize"
          />
          <button
            onClick={handleMaximize}
            className="size-3 rounded-full bg-[#28c840] hover:brightness-90 transition-all"
            aria-label="Fullscreen"
          />
        </div>
      )}

      {!isFullscreen && <Separator orientation="vertical" className="h-4" />}

      {/* App + project identity */}
      <div className="flex min-w-0 items-center gap-2 px-3">
        <span className="shrink-0 text-xs font-semibold tracking-wide">
          switchboard
        </span>
        {projectPathLabel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onProjectClick}
                className="min-w-0 truncate rounded-md border px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {projectPathLabel}
              </button>
            </TooltipTrigger>
            <TooltipContent>{projectPath}</TooltipContent>
          </Tooltip>
        ) : null}
        {projectPathLabel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
                onClick={onOpenHistory}
              >
                <History className="size-3.5" />
                History
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open History (⌘⇧H)</TooltipContent>
          </Tooltip>
        ) : null}
        {projectPathLabel ? (
          <div className="ml-1 inline-flex items-center rounded-md border bg-background/80 p-0.5">
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
        ) : null}
      </div>

      {/* Spacer — drag region */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-0.5 px-2">
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

            <Separator orientation="vertical" className="h-4 mx-1" />
          </>
        )}

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

        <Separator orientation="vertical" className="h-4 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={onOpenSettings}
            >
              <Settings className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Theme</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
