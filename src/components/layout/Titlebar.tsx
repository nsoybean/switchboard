import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  GitBranch,
  PanelLeft,
  PanelRight,
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
  gitPanelOpen: boolean;
  onToggleSidebar: () => void;
  onToggleGitPanel: () => void;
  branch?: string;
  projectName?: string;
  onProjectClick?: () => void;
  viewMode?: "focused" | "scroll";
  onToggleViewMode?: () => void;
}

export function Titlebar({
  sidebarOpen,
  gitPanelOpen,
  onToggleSidebar,
  onToggleGitPanel,
  branch,
  projectName = "switchboard",
  onProjectClick,
  viewMode = "focused",
  onToggleViewMode,
}: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const appWindow = getCurrentWindow();

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

      {/* Branch + project */}
      <div className="flex items-center gap-2 px-3">
        {branch && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            {branch}
          </span>
        )}
        <button
          onClick={onProjectClick}
          className="text-xs font-medium hover:text-muted-foreground transition-colors"
        >
          {projectName}
        </button>
      </div>

      {/* Spacer — drag region */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-0.5 px-2">
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
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onToggleGitPanel}
            >
              <PanelRight className={gitPanelOpen ? "" : "opacity-40"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Git Panel (⌘G)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4 mx-1" />

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
