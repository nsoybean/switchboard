import { useEffect, useMemo, useState, type ReactNode } from "react";
import { File, FolderTree, GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBranchPrefix } from "@/lib/branches";
import { useGitState } from "@/hooks/useGitState";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { FilePanel } from "../files/FilePanel";
import { FilePreview } from "../files/FilePreview";
import { GitPanel } from "../git/GitPanel";
import { DiffDocument } from "../git/DiffDocument";
import { BranchPicker } from "../git/BranchPicker";
import { CreateBranchDialog } from "../git/CreateBranchDialog";
import type { Session } from "../../state/types";
import type { AgentType } from "../../state/types";

export type WorkspaceTab = "files" | "changes" | "review";

export interface WorkspaceContext {
  kind: "project" | "session";
  rootPath: string | null;
  label: string;
  branch: string | null;
  availability: "resolving" | "ready" | "missing";
  source: "project" | "cwd" | "worktreePath" | "history";
  isWorktree: boolean;
}

interface WorkspacePanelProps {
  activeTab: WorkspaceTab;
  context: WorkspaceContext | null;
  visible?: boolean;
  session?: Session | null;
  githubToken?: string | null;
  onOpenSettings?: () => void;
  onSessionBranchChange?: (sessionId: string, branch: string | null) => Promise<void> | void;
  onTabChange: (tab: WorkspaceTab) => void;
}

interface WorkspaceDocumentTab {
  id: string;
  kind: "file" | "diff";
  title: string;
  filePath: string;
  staged?: boolean;
  status?: string;
}

function EmptyWorkspaceState({
  title,
  description,
  icon = false,
}: {
  title: string;
  description: string;
  icon?: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex max-w-xs flex-col items-center gap-2 text-center">
        {icon ? <FolderTree className="size-4 text-muted-foreground" /> : null}
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function getWorkspaceSubtitle(context: WorkspaceContext): string {
  if (context.availability !== "ready") {
    return "Workspace unavailable";
  }

  if (context.kind === "project") {
    return "Project root";
  }

  if (context.isWorktree) {
    return "Worktree root";
  }

  return "Launch root";
}

function ReviewNavigator({
  context,
  session,
  additions,
  deletions,
  filesChanged,
  onOpenFiles,
  onOpenChanges,
}: {
  context: WorkspaceContext;
  session?: Session | null;
  additions: number;
  deletions: number;
  filesChanged: number;
  onOpenFiles: () => void;
  onOpenChanges: () => void;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <section className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Session
          </div>
          <div className="rounded-xl border bg-background/70 p-3">
            <div className="truncate text-sm font-medium">
              {session?.label ?? context.label}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {session?.agent ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] capitalize">
                  {session.agent}
                </Badge>
              ) : null}
              {context.branch ? (
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="size-3" />
                  {context.branch}
                </span>
              ) : null}
              {context.isWorktree ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  Worktree
                </Badge>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </div>
          <div className="rounded-xl border bg-background/70 p-3">
            <div className="text-xs font-medium">{getWorkspaceSubtitle(context)}</div>
            <div
              className="mt-1 break-all font-mono text-[11px] text-muted-foreground"
              title={context.rootPath ?? undefined}
            >
              {context.rootPath ?? "Saved workspace path is no longer available."}
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Changes
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-background/70 p-3 text-center">
              <div className="text-lg font-semibold text-[var(--sb-diff-add-fg)]">+{additions}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Added</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-3 text-center">
              <div className="text-lg font-semibold text-[var(--sb-diff-del-fg)]">-{deletions}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Removed</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-3 text-center">
              <div className="text-lg font-semibold">{filesChanged}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Files</div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Next
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={onOpenFiles}
              className="rounded-xl border bg-background/70 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50"
            >
              Open the explorer to browse files for this workspace.
            </button>
            <button
              type="button"
              onClick={onOpenChanges}
              className="rounded-xl border bg-background/70 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50"
            >
              Open changes to inspect diffs, stage edits, or prepare a commit.
            </button>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function WorkspaceDocumentPane({
  tabs,
  activeTabId,
  activeNavigator,
  onSelect,
  onClose,
  children,
}: {
  tabs: WorkspaceDocumentTab[];
  activeTabId: string | null;
  activeNavigator: WorkspaceTab;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  children: ReactNode;
}) {
  const activeDocument = tabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b bg-card/65">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-2 py-2">
          {tabs.length === 0 ? (
            <span className="px-2 text-[11px] text-muted-foreground">
              {activeNavigator === "review"
                ? "Review lives in the navigator. Open a file or diff to keep it visible here."
                : "Open a file or diff to keep it visible while you continue navigating."}
            </span>
          ) : (
            tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  className={cn(
                    "group/doc flex max-w-[220px] items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                    isActive
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  <File className="size-3 shrink-0" />
                  <span className="truncate">{tab.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                    {tab.kind}
                  </span>
                  <span
                    className="ml-1 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:text-foreground group-hover/doc:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(tab.id);
                    }}
                    role="button"
                    aria-label={`Close ${tab.title}`}
                  >
                    <X className="size-3" />
                  </span>
                </button>
              );
            })
          )}
        </div>
        {activeDocument ? (
          <div
            className="border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
            title={activeDocument.filePath}
          >
            {activeDocument.filePath}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export function WorkspacePanel({
  activeTab,
  context,
  visible = true,
  session,
  githubToken,
  onOpenSettings,
  onSessionBranchChange,
  onTabChange,
}: WorkspacePanelProps) {
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [documentTabs, setDocumentTabs] = useState<WorkspaceDocumentTab[]>([]);
  const [activeDocumentTabId, setActiveDocumentTabId] = useState<string | null>(null);

  const hasRoot = context?.availability === "ready" && !!context.rootPath;

  const git = useGitState({
    cwd: hasRoot ? context.rootPath! : "",
    visible: hasRoot && visible,
    sessionId: context?.kind === "session" ? session?.id : null,
    onSessionBranchChange,
  });

  const rootKey = context
    ? `${context.kind}:${context.source}:${context.rootPath ?? "missing"}`
    : "missing";
  const branchPrefix = context?.kind === "session" && session?.agent
    ? getBranchPrefix(session.agent as AgentType)
    : undefined;

  useEffect(() => {
    setDocumentTabs([]);
    setActiveDocumentTabId(null);
  }, [rootKey]);

  const activeDocument = useMemo(
    () =>
      documentTabs.find((tab) => tab.id === activeDocumentTabId) ?? null,
    [documentTabs, activeDocumentTabId],
  );

  const activeFilePath = activeDocument?.kind === "file"
    ? activeDocument.filePath
    : null;
  const activeDiffPath = activeDocument?.kind === "diff"
    ? activeDocument.filePath
    : null;
  const activeDiffStaged = activeDocument?.kind === "diff"
    ? Boolean(activeDocument.staged)
    : null;

  const openFile = (filePath: string) => {
    const id = `file:${filePath}`;
    const nextTab: WorkspaceDocumentTab = {
      id,
      kind: "file",
      title: basename(filePath),
      filePath,
    };

    setDocumentTabs((current) => {
      if (current.some((tab) => tab.id === id)) {
        return current;
      }
      return [...current, nextTab];
    });
    setActiveDocumentTabId(id);
  };

  const openDiff = ({
    path,
    staged,
    status,
  }: {
    path: string;
    staged: boolean;
    status: string;
  }) => {
    const id = `diff:${staged ? "staged" : "unstaged"}:${path}`;
    const nextTab: WorkspaceDocumentTab = {
      id,
      kind: "diff",
      title: basename(path),
      filePath: path,
      staged,
      status,
    };

    setDocumentTabs((current) => {
      if (current.some((tab) => tab.id === id)) {
        return current;
      }
      return [...current, nextTab];
    });
    setActiveDocumentTabId(id);
  };

  const closeDocument = (id: string) => {
    setDocumentTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      if (index === -1) {
        return current;
      }

      const nextTabs = current.filter((tab) => tab.id !== id);
      setActiveDocumentTabId((currentActive) => {
        if (currentActive !== id) {
          return currentActive;
        }

        const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? null;
        return fallback?.id ?? null;
      });
      return nextTabs;
    });
  };

  const renderUnavailableState = (currentContext: WorkspaceContext, tab: WorkspaceTab) => {
    if (currentContext.availability === "resolving") {
      return (
        <EmptyWorkspaceState
          title="Resolving workspace"
          description="Switchboard is validating the selected session's workspace root."
        />
      );
    }

    if (currentContext.availability === "missing") {
      return (
        <EmptyWorkspaceState
          title={tab === "changes" ? "Cannot load changes" : "Workspace unavailable"}
          description={`Switchboard can still show ${currentContext.label}, but the saved workspace path is no longer available on disk.`}
          icon
        />
      );
    }

    if (!currentContext.rootPath) {
      return (
        <EmptyWorkspaceState
          title="No workspace selected"
          description="Open a project or select a session to inspect its workspace."
          icon
        />
      );
    }

    return null;
  };

  if (!context) {
    return null;
  }

  const unavailableState = renderUnavailableState(context, activeTab);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
      <div className="border-b px-3 py-2.5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{context.label}</span>
              {context.isWorktree ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  Worktree
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span>{getWorkspaceSubtitle(context)}</span>
              {context.rootPath ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="min-w-0 truncate font-mono" title={context.rootPath}>
                    {context.rootPath}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {hasRoot ? (
            <div className="min-w-0 shrink-0">
              <BranchPicker
                branches={git.branches}
                loading={git.branchesLoading && git.branches.length === 0}
                value={git.branch}
                disabled={git.branchActionPending}
                triggerClassName="h-8 min-w-[140px] max-w-full justify-between gap-2 px-2 text-xs"
                createLabel="Create and checkout new branch..."
                onSelect={(branchName) => void git.switchBranch(branchName)}
                onCreateBranch={() => setCreateBranchOpen(true)}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {unavailableState ? (
          unavailableState
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={38} minSize={24}>
              <div className="flex h-full min-h-0 flex-col border-r bg-card">
                <div className="border-b px-2 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {([
                      { key: "files", label: "Explorer" },
                      { key: "changes", label: "Changes" },
                      { key: "review", label: "Review" },
                    ] as const).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => onTabChange(tab.key)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          activeTab === tab.key
                            ? "border-border bg-background text-foreground shadow-sm"
                            : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  {activeTab === "files" ? (
                    <FilePanel
                      rootPath={context.rootPath!}
                      selectedPath={activeFilePath}
                      onFileSelect={openFile}
                    />
                  ) : null}

                  {activeTab === "changes" ? (
                    <GitPanel
                      cwd={context.rootPath!}
                      git={git}
                      githubToken={githubToken}
                      onOpenSettings={onOpenSettings}
                      onOpenDiff={openDiff}
                      activeDiffPath={activeDiffPath}
                      activeDiffStaged={activeDiffStaged}
                    />
                  ) : null}

                  {activeTab === "review" ? (
                    <ReviewNavigator
                      context={context}
                      session={session}
                      additions={git.stats.additions}
                      deletions={git.stats.deletions}
                      filesChanged={git.stats.files_changed}
                      onOpenFiles={() => onTabChange("files")}
                      onOpenChanges={() => onTabChange("changes")}
                    />
                  ) : null}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={62} minSize={34}>
              <WorkspaceDocumentPane
                tabs={documentTabs}
                activeTabId={activeDocumentTabId}
                activeNavigator={activeTab}
                onSelect={setActiveDocumentTabId}
                onClose={closeDocument}
              >
                {activeDocument ? (
                  activeDocument.kind === "file" ? (
                    <FilePreview filePath={activeDocument.filePath} showHeader={false} />
                  ) : (
                    <DiffDocument
                      cwd={context.rootPath!}
                      path={activeDocument.filePath}
                      staged={Boolean(activeDocument.staged)}
                      status={activeDocument.status}
                    />
                  )
                ) : (
                  <EmptyWorkspaceState
                    title="No document open"
                    description={
                      activeTab === "review"
                        ? "Review stays in the navigator. Open a file or diff to keep it visible here while you supervise the session."
                        : "Open a file from Explorer or a diff from Changes to keep it visible in this docked document pane."
                    }
                    icon
                  />
                )}
              </WorkspaceDocumentPane>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {hasRoot ? (
        <CreateBranchDialog
          open={createBranchOpen}
          onOpenChange={setCreateBranchOpen}
          defaultBranchPrefix={branchPrefix}
          pending={git.branchActionPending}
          onCreate={async (branchName) => {
            await git.createBranch(branchName);
            setCreateBranchOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
