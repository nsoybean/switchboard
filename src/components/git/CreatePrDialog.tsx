import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Copy, Check } from "lucide-react";
import { BranchPicker } from "./BranchPicker";
import { gitCommands, type GitBranchInfo } from "../../lib/tauri-commands";

interface CreatePrDialogProps {
  open: boolean;
  onClose: () => void;
  cwd: string;
  githubToken: string;
}

export function CreatePrDialog({
  open: isOpen,
  onClose,
  cwd,
  githubToken,
}: CreatePrDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("main");
  const [baseBranches, setBaseBranches] = useState<GitBranchInfo[]>([]);
  const [baseBranchesLoading, setBaseBranchesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || prUrl) {
      return;
    }

    let cancelled = false;

    const loadBaseBranches = async () => {
      setBaseBranchesLoading(true);
      try {
        const branches = await gitCommands.listRemoteBranches(cwd);
        if (cancelled) return;

        setBaseBranches(branches);
        setBase((current) => {
          if (branches.some((branch) => branch.name === current)) {
            return current;
          }
          return branches[0]?.name ?? current;
        });
      } catch (err) {
        if (cancelled) return;
        setBaseBranches([]);
        setError((current) => current ?? `Failed to load remote branches: ${String(err)}`);
      } finally {
        if (!cancelled) {
          setBaseBranchesLoading(false);
        }
      }
    };

    void loadBaseBranches();

    return () => {
      cancelled = true;
    };
  }, [cwd, isOpen, prUrl]);

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
        githubToken,
      );
      setPrUrl(url.trim());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!prUrl) return;
    try {
      await writeText(prUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: navigator clipboard
      await navigator.clipboard.writeText(prUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenInBrowser = () => {
    if (prUrl) open(prUrl);
  };

  const handleClose = () => {
    setTitle("");
    setBody("");
    setBase("main");
    setBaseBranches([]);
    setBaseBranchesLoading(false);
    setError(null);
    setPrUrl(null);
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Pull Request</DialogTitle>
          <DialogDescription>
            {prUrl
              ? "Pull request created successfully."
              : "Push your branch and create a PR on GitHub."}
          </DialogDescription>
        </DialogHeader>

        {prUrl ? (
          <div className="flex flex-col gap-4 pt-2">
            {/* PR URL display */}
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <span className="flex-1 truncate text-sm font-mono">{prUrl}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="size-3.5 text-green-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleOpenInBrowser}
                className="flex-1"
              >
                <ExternalLink data-icon="inline-start" />
                Open in Browser
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
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
              {baseBranches.length > 0 || baseBranchesLoading ? (
                <BranchPicker
                  branches={baseBranches}
                  loading={baseBranchesLoading}
                  value={base}
                  onSelect={setBase}
                  showCurrentBadge={false}
                  triggerClassName="h-9 justify-between px-3 text-sm"
                  emptyLabel="No remote branches available."
                />
              ) : (
                <Input
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  placeholder="main"
                />
              )}
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <>
                    <Spinner className="size-3" />
                    Creating...
                  </>
                ) : (
                  "Create PR"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
