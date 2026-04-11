import { useState } from "react";
import { ArrowLeft, Info, Puzzle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GeneralSettings } from "./GeneralSettings";
// import { NotificationSettings } from "./NotificationSettings";
import { IntegrationSettings } from "./IntegrationSettings";
import { AboutSettings } from "./AboutSettings";

const TABS = [
  { id: "general", label: "General", icon: Settings2 },
  // { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "about", label: "About", icon: Info },
] as const;

type SettingsTab = (typeof TABS)[number]["id"];

interface SettingsPageProps {
  onBack: () => void;
  currentVersion: string | null;
  updateVersion: string | null;
  updateNotes?: string;
  checkingForUpdates: boolean;
  installingUpdate: boolean;
  updateProgress: number | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
}

export function SettingsPage({
  onBack,
  currentVersion,
  updateVersion,
  updateNotes,
  checkingForUpdates,
  installingUpdate,
  updateProgress,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
        <Button variant="ghost" size="icon" className="size-8" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </div>

      {/* Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar nav */}
        <nav className="w-44 border-r py-4 px-2 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl py-8 px-6">
            {activeTab === "general" && <GeneralSettings />}
            {/* {activeTab === "notifications" && <NotificationSettings />} */}
            {activeTab === "integrations" && <IntegrationSettings />}
            {activeTab === "about" && (
              <AboutSettings
                currentVersion={currentVersion}
                updateVersion={updateVersion}
                updateNotes={updateNotes}
                checkingForUpdates={checkingForUpdates}
                installingUpdate={installingUpdate}
                updateProgress={updateProgress}
                onCheckForUpdates={onCheckForUpdates}
                onInstallUpdate={onInstallUpdate}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
