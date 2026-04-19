import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProjectPickerProps {
  projects: string[];
  value: string | null;
  onSelect: (path: string) => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  emptyLabel?: string;
  placeholder?: string;
  showIcon?: boolean;
}

function getProjectLabel(path: string | null) {
  if (!path) return "";
  return path.split("/").pop() ?? path;
}

export function ProjectPicker({
  projects,
  value,
  onSelect,
  disabled = false,
  align = "start",
  triggerClassName,
  emptyLabel = "No projects available.",
  placeholder = "Select project",
  showIcon = true,
}: ProjectPickerProps) {
  const selectedLabel = getProjectLabel(value);

  if (projects.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className={cn("h-10 w-full justify-between px-3 text-xs font-normal", triggerClassName)}
      >
        {emptyLabel}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("h-10 w-full justify-between px-3 text-xs font-normal", triggerClassName)}
          title={value ?? undefined}
        >
          <span className="flex min-w-0 items-center gap-2">
            {showIcon ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" /> : null}
            <span className="truncate">{selectedLabel || placeholder}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[max(var(--radix-dropdown-menu-trigger-width),18rem)] p-1"
      >
        {projects.map((projectPath) => (
          <DropdownMenuItem
            key={projectPath}
            title={projectPath}
            className={cn(
              "px-2 py-2 text-xs",
              value === projectPath && "bg-muted text-foreground",
            )}
            onSelect={() => onSelect(projectPath)}
          >
            <span className="truncate">{getProjectLabel(projectPath)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
