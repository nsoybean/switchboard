import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  PanelLeft,
  PanelRight,
  Settings,
  Square,
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
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  projectPath?: string | null;
  onProjectClick?: () => void;
  viewMode?: "focused" | "scroll";
  onToggleViewMode?: () => void;
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
  onToggleSidebar,
  onToggleInspector,
  projectPath,
  onProjectClick,
  viewMode = "focused",
  onToggleViewMode,
  onOpenSettings,
  updateVersion = null,
  checkingForUpdates = false,
  installingUpdate = false,
  updateProgress = null,
  onInstallUpdate,
}: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const appWindow = getCurrentWindow();
  const projectPathLabel = projectPath
    ? projectPath.split("/").slice(-2).join("/")
    : null;
  const inspectorAvailable = viewMode === "focused";

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center h-[38px] border-b bg-background select-none shrink-0"
    >
      {/* Window controls — always visible */}
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
          aria-label="Maximize"
        />
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Navigation */}
      <div className="flex items-center gap-0.5 px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" disabled>
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" disabled>
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Forward</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4" />

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
                className="min-w-0 truncate rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {projectPathLabel}
              </button>
            </TooltipTrigger>
            <TooltipContent>{projectPath}</TooltipContent>
          </Tooltip>
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
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onInstallUpdate}
              disabled={checkingForUpdates || installingUpdate}
            >
              {installingUpdate ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="size-3.5" />
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
              className="size-7"
              onClick={onToggleViewMode}
            >
              {viewMode === "scroll" ? (
                <Square className="size-3.5" />
              ) : (
                <Columns2 className="size-3.5 opacity-40" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {viewMode === "scroll" ? "Focused View (⌘⇧S)" : "Scroll View (⌘⇧S)"}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4 mx-0.5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onToggleSidebar}
            >
              <PanelLeft className={sidebarOpen ? "" : "opacity-40"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Sidebar (⌘B)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!inspectorAvailable}
                onClick={onToggleInspector}
              >
                <PanelRight className={inspectorOpen ? "" : "opacity-40"} />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {inspectorAvailable
              ? "Toggle Inspector (⌘G)"
              : "Only available in focused view"}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onOpenSettings}
            >
              <Settings className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Theme</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
