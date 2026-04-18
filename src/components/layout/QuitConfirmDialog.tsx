import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { AgentIcon } from "@/components/agents/AgentIcon";
import type { Session } from "@/state/types";

interface QuitConfirmDialogProps {
  open: boolean;
  liveSessions: Session[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuitConfirmDialog({
  open,
  liveSessions,
  onConfirm,
  onCancel,
}: QuitConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quit Switchboard?</DialogTitle>
          <DialogDescription>
            {liveSessions.length === 1
              ? "1 session is still running."
              : `${liveSessions.length} sessions are still running.`}{" "}
            Quitting will stop them.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          {liveSessions.map((session) => (
            <div key={session.id} className="flex items-center gap-2 py-1">
              <AgentIcon agent={session.agent} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {session.label || "New session"}
              </span>
              <StatusDot status={session.status} />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Quit anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
