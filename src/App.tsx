import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { AppProvider } from "./state/context";
import { AppLayout } from "./components/layout/AppLayout";
import { ThemeProvider } from "./components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
// TODO: dock bounce + badge when session needs attention (idle/needs-input) while unfocused
// import { useDockAttention } from "./hooks/useNotchNotifications";

// function DockAttentionLayer() {
//   useDockAttention();
//   return null;
// }

function App() {
  const isMacOS =
    typeof window !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);

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
            <div
              className={cn(
                "h-full min-h-0 flex-1",
                isMacOS && "relative z-10 sb-window-frame",
              )}
            >
              <AppLayout />
            </div>
          </div>
          {/* <DockAttentionLayer /> */}
          <Toaster position="bottom-right" richColors />
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
