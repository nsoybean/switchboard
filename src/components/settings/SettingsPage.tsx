import { useState } from "react";
import { ArrowLeft, Bell, Info, Puzzle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GeneralSettings } from "./GeneralSettings";
import { NotificationSettings } from "./NotificationSettings";
import { IntegrationSettings } from "./IntegrationSettings";
import { AboutSettings } from "./AboutSettings";

const TABS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "notifications", label: "Notifications", icon: Bell },
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
    <div className="flex h-full flex-col bg-background font-sans">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card/95 px-3">
        <Button variant="ghost" size="icon" className="size-7" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-sm font-semibold">Settings</h1>
      </div>

      {/* Sidebar + Content */}
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar nav */}
        <nav className="w-52 shrink-0 border-r bg-card px-2 py-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                activeTab === tab.id
                  ? "bg-accent/80 font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/55 hover:text-foreground"
              }`}
            >
              <tab.icon className="size-3.5 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl px-8 py-7">
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "notifications" && <NotificationSettings />}
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
