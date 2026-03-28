import { useEffect } from "react";
import { getCurrentWindow, type CursorIcon } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import { AppProvider } from "./state/context";
import { AppLayout } from "./components/layout/AppLayout";
import { ThemeProvider } from "./components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

type ResizeHandle = {
  direction: ResizeDirection;
  cursor: CursorIcon;
  className: string;
};

const RESIZE_HANDLES: ResizeHandle[] = [
  {
    direction: "North",
    cursor: "nsResize",
    className: "top-0 left-4 right-4 h-3 cursor-n-resize",
  },
  {
    direction: "South",
    cursor: "nsResize",
    className: "bottom-0 left-4 right-4 h-3 cursor-s-resize",
  },
  {
    direction: "East",
    cursor: "ewResize",
    className: "top-4 right-0 bottom-4 w-3 cursor-e-resize",
  },
  {
    direction: "West",
    cursor: "ewResize",
    className: "top-4 left-0 bottom-4 w-3 cursor-w-resize",
  },
  {
    direction: "NorthEast",
    cursor: "neswResize",
    className: "top-0 right-0 h-4 w-4 cursor-ne-resize",
  },
  {
    direction: "NorthWest",
    cursor: "nwseResize",
    className: "top-0 left-0 h-4 w-4 cursor-nw-resize",
  },
  {
    direction: "SouthEast",
    cursor: "nwseResize",
    className: "right-0 bottom-0 h-4 w-4 cursor-se-resize",
  },
  {
    direction: "SouthWest",
    cursor: "neswResize",
    className: "bottom-0 left-0 h-4 w-4 cursor-sw-resize",
  },
];

function App() {
  const isMacOS =
    typeof window !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const root = document.documentElement;

    if (isMacOS) {
      root.dataset.platform = "macos";
      return () => {
        delete root.dataset.platform;
      };
    }

    delete root.dataset.platform;
  }, [isMacOS]);

  const handleResizeStart = (
    event: React.MouseEvent<HTMLButtonElement>,
    direction: ResizeDirection,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    void appWindow.startResizeDragging(direction);
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <AppProvider>
          <div
            className={cn(
              "flex h-full min-h-0",
              isMacOS && "relative sb-window-shell",
            )}
          >
            {isMacOS ? (
              <div className="pointer-events-none absolute inset-0 z-20">
                {RESIZE_HANDLES.map((handle) => (
                  <button
                    key={handle.direction}
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className={cn(
                      "pointer-events-auto absolute rounded-none border-0 bg-transparent p-0 outline-none",
                      handle.className,
                    )}
                    onMouseDown={(event) =>
                      handleResizeStart(event, handle.direction)
                    }
                    onMouseEnter={() => void appWindow.setCursorIcon(handle.cursor)}
                    onMouseLeave={() => void appWindow.setCursorIcon("default")}
                  />
                ))}
              </div>
            ) : null}

            <div
              className={cn(
                "h-full min-h-0 flex-1",
                isMacOS && "relative z-10 sb-window-frame",
              )}
            >
              <AppLayout />
            </div>
          </div>
          <Toaster position="bottom-right" richColors />
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
