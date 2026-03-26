import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  PanelLeft,
  PanelRight,
  Sun,
  Moon,
  Minus,
  Square,
  X,
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
}

export function Titlebar({
  sidebarOpen,
  gitPanelOpen,
  onToggleSidebar,
  onToggleGitPanel,
  branch,
  projectName = "switchboard",
}: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(navigator.userAgent.includes("Mac"));
  }, []);

  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center h-[38px] border-b bg-background select-none shrink-0"
      style={{ paddingLeft: isMac ? 78 : 0 }}
    >
      {/* Navigation */}
      <div className="flex items-center gap-0.5 px-2">
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
        <span className="text-xs font-medium">{projectName}</span>
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
              onClick={onToggleSidebar}
            >
              <PanelLeft className={sidebarOpen ? "" : "opacity-40"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Sidebar</TooltipContent>
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
          <TooltipContent>Toggle Git Panel</TooltipContent>
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

        {/* Window controls — Windows/Linux only */}
        {!isMac && (
          <>
            <Separator orientation="vertical" className="h-4 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => appWindow.minimize()}
            >
              <Minus className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => appWindow.toggleMaximize()}
            >
              <Square className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => appWindow.close()}
            >
              <X className="size-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
