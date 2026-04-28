import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { settingsCommands, type NotificationPrefs } from "../../lib/tauri-commands";
import { toast } from "sonner";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  sound_enabled: false,
};

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    settingsCommands
      .getNotificationPrefs()
      .then((p) => {
        setPrefs(p);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const update = async (next: NotificationPrefs) => {
    setPrefs(next);
    try {
      await settingsCommands.setNotificationPrefs(next);
    } catch {
      toast.error("Failed to save notification preferences");
    }
  };

  const testNotification = async () => {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    if (!granted) {
      toast.error("Notification permission denied — check System Settings → Notifications");
      return;
    }
    sendNotification({
      title: "Switchboard",
      body: "Test notification — it's working!",
      sound: prefs.sound_enabled ? "Ping" : undefined,
    });
  };

  if (!loaded) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Notifications</h2>
        </div>
        <Button variant="outline" size="sm" onClick={testNotification}>
          Test
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        Desktop notifications when a session finishes while you're in another window.
      </p>

      <div className="divide-y rounded-md border bg-card">
        <div className="flex items-center justify-between px-3 py-3">
          <div>
            <p className="text-sm">Enable notifications</p>
            <p className="text-[11px] text-muted-foreground">
              Show a macOS notification when a session completes
            </p>
          </div>
          <Switch
            checked={prefs.enabled}
            onCheckedChange={(v) => update({ ...prefs, enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between px-3 py-3">
          <div>
            <p className="text-sm">Sound</p>
            <p className="text-[11px] text-muted-foreground">
              Play a chime with the notification
            </p>
          </div>
          <Switch
            checked={prefs.sound_enabled}
            onCheckedChange={(v) => update({ ...prefs, sound_enabled: v })}
          />
        </div>
      </div>
    </section>
  );
}
