import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBranchPrefix?: string;
  pending?: boolean;
  title?: string;
  actionLabel?: string;
  onCreate: (branchName: string) => Promise<void> | void;
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  defaultBranchPrefix = "",
  pending = false,
  title = "Create and checkout branch",
  actionLabel = "Create and checkout",
  onCreate,
}: CreateBranchDialogProps) {
  const [branchName, setBranchName] = useState(defaultBranchPrefix);

  useEffect(() => {
    if (!open) {
      setBranchName(defaultBranchPrefix);
    }
  }, [defaultBranchPrefix, open]);

  const trimmedBranchName = branchName.trim();
  const canSubmit =
    !pending && trimmedBranchName.length > 0 && !trimmedBranchName.endsWith("/");

  const handleCreate = async () => {
    if (!canSubmit) return;
    await onCreate(trimmedBranchName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Branch name
              </label>
              <button
                type="button"
                onClick={() =>
                  setBranchName((currentValue) => {
                    const trimmed = currentValue.trim();
                    if (!defaultBranchPrefix) return trimmed;
                    if (!trimmed) return defaultBranchPrefix;
                    return trimmed.startsWith(defaultBranchPrefix)
                      ? trimmed
                      : `${defaultBranchPrefix}${trimmed}`;
                  })
                }
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Set prefix
              </button>
            </div>
            <Input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder={
                defaultBranchPrefix
                  ? `${defaultBranchPrefix}my-branch`
                  : "my-branch"
              }
              className="font-mono"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleCreate();
                }
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Close
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!canSubmit}>
              {actionLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
