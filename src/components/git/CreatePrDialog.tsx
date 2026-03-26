import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink } from "lucide-react";
import { gitCommands } from "../../lib/tauri-commands";

interface CreatePrDialogProps {
  open: boolean;
  onClose: () => void;
  cwd: string;
}

export function CreatePrDialog({
  open: isOpen,
  onClose,
  cwd,
}: CreatePrDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = await gitCommands.createPr(
        cwd,
        title.trim(),
        body.trim(),
        base.trim(),
      );
      // Open the GitHub compare URL in the browser
      await open(url.trim());
      handleClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setBody("");
    setBase("main");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Pull Request</DialogTitle>
          <DialogDescription>
            Push your branch and open GitHub to create a PR.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="PR title"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Description (optional)
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your changes..."
              rows={4}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Base Branch
            </label>
            <Input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="main"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              <ExternalLink data-icon="inline-start" />
              {loading ? "Pushing..." : "Create PR"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
