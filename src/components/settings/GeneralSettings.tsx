import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { useAppState } from "../../state/context";
import { settingsCommands } from "@/lib/tauri-commands";
import { toast } from "sonner";

export function GeneralSettings() {
  const state = useAppState();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showBranch, setShowBranch] = useState(true);
  const [uiPrefsLoaded, setUiPrefsLoaded] = useState(false);

  useEffect(() => {
    settingsCommands.getUiPrefs()
      .then((prefs) => {
        setShowBranch(prefs.show_agent_branch);
        setUiPrefsLoaded(true);
      })
      .catch(() => setUiPrefsLoaded(true));
  }, []);

  const updateShowBranch = async (value: boolean) => {
    setShowBranch(value);
    try {
      await settingsCommands.setUiPrefs({ show_agent_branch: value });
    } catch {
      toast.error("Failed to save preference");
    }
  };

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Project</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Switchboard is currently focused on this git repository.
        </p>

        <div className="rounded-md border bg-card px-3 py-3">
          <p className="text-xs text-muted-foreground">Selected project repo</p>
          {state.projectPath ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="mt-1 truncate font-mono text-sm" title={state.projectPath}>
                  {state.projectPath}
                </p>
              </TooltipTrigger>
              <TooltipContent>{state.projectPath}</TooltipContent>
            </Tooltip>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No project selected</p>
          )}
          <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
            Projects added: {state.projects.length}
          </p>
        </div>
      </section>

      <section className="mt-8 border-t pt-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold">Agent List</h2>
        </div>

        {uiPrefsLoaded && (
          <div className="flex items-center justify-between rounded-md border bg-card px-3 py-3">
            <div>
              <p className="text-sm font-medium">Show branch on agent cards</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Display the active branch or worktree on each agent in the sidebar.
              </p>
            </div>
            <Switch
              checked={showBranch}
              onCheckedChange={(v) => void updateShowBranch(v)}
            />
          </div>
        )}
      </section>

      <section className="mt-8 border-t pt-6">
        <div className="flex items-center gap-2 mb-1">
          <Trash2 className="size-4 text-destructive" />
          <h2 className="text-sm font-semibold">Delete All Data</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Remove all Switchboard data from your machine. This deletes sessions,
          metadata, configuration, and preferences. This action cannot be undone.
        </p>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            Delete my data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await invoke("delete_all_data");
                  window.location.reload();
                } catch {
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, delete everything"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </>
  );
}
