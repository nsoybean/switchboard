import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen } from "lucide-react";
import { projectCommands } from "../../lib/tauri-commands";

interface ProjectPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function ProjectPickerDialog({
  open: isOpen,
  onClose,
  onSelect,
}: ProjectPickerDialogProps) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setPath(selected);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    const trimmed = path.trim();
    if (!trimmed) {
      setError("Please enter a project path");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await projectCommands.setPath(trimmed);
      onSelect(trimmed);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Open Project</DialogTitle>
          <DialogDescription>
            Select a git repository to manage with Switchboard.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Project Directory
            </label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setError(null);
                }}
                placeholder="/path/to/your/project"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
              <Button variant="outline" size="icon" onClick={handleBrowse}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Validating..." : "Open Project"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
