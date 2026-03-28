import { ArrowDownToLine, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AboutSettingsProps {
  currentVersion: string | null;
  updateVersion: string | null;
  updateNotes?: string;
  checkingForUpdates: boolean;
  installingUpdate: boolean;
  updateProgress: number | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
}

export function AboutSettings({
  currentVersion,
  updateVersion,
  updateNotes,
  checkingForUpdates,
  installingUpdate,
  updateProgress,
  onCheckForUpdates,
  onInstallUpdate,
}: AboutSettingsProps) {
  return (
    <>
      <section>
        <div className="flex items-center justify-between gap-3 mb-1">
          <div>
            <h2 className="text-sm font-semibold">App Updates</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Checks GitHub Releases on launch.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onCheckForUpdates}
            disabled={checkingForUpdates || installingUpdate}
          >
            {checkingForUpdates ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Check for Updates
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/30 px-4 py-3 mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Current version</p>
              <p className="text-sm font-medium">{currentVersion ?? "Loading..."}</p>
            </div>

            {updateVersion ? (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={onInstallUpdate}
                disabled={checkingForUpdates || installingUpdate}
              >
                {installingUpdate ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowDownToLine className="size-3.5" />
                )}
                {installingUpdate && updateProgress !== null
                  ? `Installing ${updateProgress}%`
                  : `Install ${updateVersion}`}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">No pending update</span>
            )}
          </div>

          {updateVersion && (
            <div className="rounded-md border bg-background px-3 py-2">
              <p className="text-xs font-medium">Update available: {updateVersion}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {updateNotes?.trim() ||
                  "Download and install the latest signed GitHub release, then restart the app automatically."}
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
