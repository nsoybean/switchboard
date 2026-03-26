import { AppProvider } from "./state/context";
import { AppLayout } from "./components/layout/AppLayout";
import { ThemeProvider } from "./components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <AppProvider>
          <AppLayout />
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
