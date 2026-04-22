import { Command, ArrowFatLineUp } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function KeyCap({ k }: { k: string }) {
  if (k === "Cmd") return <Command className="size-3.5" />;
  if (k === "⇧") return <ArrowFatLineUp className="size-3.5" weight="fill" />;
  return <span>{k}</span>;
}

interface ShortcutRowProps {
  keys: string[];
  label: string;
}

function ShortcutRow({ keys, label }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs text-foreground"
          >
            <KeyCap k={key} />
          </kbd>
        ))}
      </div>
    </div>
  );
}

function ShortcutGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">
        {title}
      </p>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-8 overflow-y-auto max-h-[60vh] pr-1">
          <ShortcutGroup title="Sessions">
            <ShortcutRow keys={["Cmd", "N"]} label="New session" />
            <ShortcutRow keys={["Cmd", "W"]} label="Close session / transcript" />
            <ShortcutRow keys={["Cmd", "1–9"]} label="Switch to session" />
            <ShortcutRow keys={["Ctrl", "Tab"]} label="Next session" />
            <ShortcutRow keys={["Ctrl", "⇧", "Tab"]} label="Previous session" />
          </ShortcutGroup>
          <ShortcutGroup title="Navigation">
            <ShortcutRow keys={["Cmd", "B"]} label="Toggle sidebar" />
            <ShortcutRow keys={["Cmd", "G"]} label="Toggle inspector" />
            <ShortcutRow keys={["Cmd", "E"]} label="Open Files tab" />
            <ShortcutRow keys={["Cmd", "⇧", "E"]} label="Open Changes tab" />
            <ShortcutRow keys={["Cmd", "⇧", "H"]} label="Open history" />
            <ShortcutRow keys={["Cmd", "P"]} label="Command palette" />
          </ShortcutGroup>
          <ShortcutGroup title="View">
            <ShortcutRow keys={["Cmd", "="]} label="Zoom in" />
            <ShortcutRow keys={["Cmd", "−"]} label="Zoom out" />
            <ShortcutRow keys={["Cmd", "0"]} label="Reset zoom" />
          </ShortcutGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
