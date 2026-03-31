import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Focus, FolderOpen, LayoutGrid, Trash2 } from "lucide-react";
import { DotsNine } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppState, useAppDispatch } from "../../state/context";

export function GeneralSettings() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <section>
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="size-4" />
          <h2 className="text-sm font-semibold">Project</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Switchboard is currently focused on this git repository.
        </p>

        <div className="rounded-lg border bg-muted/30 px-4 py-3">
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
          <p className="mt-3 text-[11px] text-muted-foreground">
            Projects added: {state.projects.length}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-2 mb-1">
          <LayoutGrid className="size-4" />
          <h2 className="text-sm font-semibold">View Mode</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          How terminal sessions are displayed.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => dispatch({ type: "SET_VIEW_MODE", mode: "focused" })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
              state.viewMode === "focused"
                ? "bg-accent text-accent-foreground border-accent-foreground/20 font-medium"
                : "bg-muted/30 text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <Focus className="size-4" />
            Focused
          </button>
          <button
            onClick={() => dispatch({ type: "SET_VIEW_MODE", mode: "grid" })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
              state.viewMode === "grid"
                ? "bg-accent text-accent-foreground border-accent-foreground/20 font-medium"
                : "bg-muted/30 text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <LayoutGrid className="size-4" />
            Grid
          </button>
          <button
            onClick={() => dispatch({ type: "SET_VIEW_MODE", mode: "canvas" })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
              state.viewMode === "canvas"
                ? "bg-accent text-accent-foreground border-accent-foreground/20 font-medium"
                : "bg-muted/30 text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <DotsNine className="size-4" />
            Canvas
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {state.viewMode === "focused"
            ? "Shows one terminal at a time."
            : state.viewMode === "grid"
              ? "Shows all active terminals in a grid layout."
              : "Free-form canvas with draggable, resizable terminal tiles."}
        </p>
      </section>

      <section className="mt-12 border-t pt-8">
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
            className="px-4 py-2 rounded-lg border border-destructive/30 text-sm text-destructive transition-colors hover:bg-destructive/10"
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
              className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, delete everything"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-lg border text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </>
  );
}
