import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { settingsCommands, type NotificationPrefs } from "../../lib/tauri-commands";
import { toast } from "sonner";

const DEFAULT_PREFS: NotificationPrefs = {
  native_enabled: true,
  notch_enabled: true,
  sound_enabled: false,
  statuses: {
    done: true,
    error: true,
    needs_input: true,
    stopped: true,
  },
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

  if (!loaded) return null;

  return (
    <>
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Bell className="size-4" />
          <h2 className="text-sm font-semibold">Notifications</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Notifications fire when the app is not focused to alert you about session status changes.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Notch notifications</p>
              <p className="text-[11px] text-muted-foreground">
                In-app pill at the top of the window
              </p>
            </div>
            <Switch
              checked={prefs.notch_enabled}
              onCheckedChange={(v) => update({ ...prefs, notch_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Native notifications</p>
              <p className="text-[11px] text-muted-foreground">
                OS-level notifications (macOS Notification Center)
              </p>
            </div>
            <Switch
              checked={prefs.native_enabled}
              onCheckedChange={(v) => update({ ...prefs, native_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Sound</p>
              <p className="text-[11px] text-muted-foreground">
                Play a chime when notifications fire
              </p>
            </div>
            <Switch
              checked={prefs.sound_enabled}
              onCheckedChange={(v) => update({ ...prefs, sound_enabled: v })}
            />
          </div>
        </div>
      </section>

      <Separator className="my-8" />

      <section>
        <h2 className="text-sm font-semibold mb-1">Status triggers</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Choose which session states trigger notifications.
        </p>

        <div className="space-y-3">
          <StatusToggle
            label="Turn complete"
            description="Session finished its turn"
            color="var(--sb-status-done)"
            checked={prefs.statuses.done}
            onChange={(v) =>
              update({ ...prefs, statuses: { ...prefs.statuses, done: v } })
            }
          />
          <StatusToggle
            label="Error"
            description="Session encountered an error"
            color="var(--sb-status-error)"
            checked={prefs.statuses.error}
            onChange={(v) =>
              update({ ...prefs, statuses: { ...prefs.statuses, error: v } })
            }
          />
          <StatusToggle
            label="Needs input"
            description="Session requires approval or a response"
            color="var(--sb-status-warning)"
            checked={prefs.statuses.needs_input}
            onChange={(v) =>
              update({
                ...prefs,
                statuses: { ...prefs.statuses, needs_input: v },
              })
            }
          />
          <StatusToggle
            label="Stopped"
            description="Session was stopped"
            color="var(--muted-foreground)"
            checked={prefs.statuses.stopped}
            onChange={(v) =>
              update({
                ...prefs,
                statuses: { ...prefs.statuses, stopped: v },
              })
            }
          />
        </div>
      </section>
    </>
  );
}

function StatusToggle({
  label,
  description,
  color,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span
          className="size-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div>
          <p className="text-sm">{label}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
