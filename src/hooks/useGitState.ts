import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitCommands,
  type ChangedFile,
  type DiffStats,
  type GitBranchInfo,
  type GitCommit,
  type GitAheadBehind,
  type StashEntry,
  type MergeStrategy,
} from "../lib/tauri-commands";
import { toast } from "sonner";

export interface GitState {
  branch: string;
  branches: GitBranchInfo[];
  currentBranchUpstreamStatus: "none" | "tracking" | "gone";
  branchesLoading: boolean;
  branchActionPending: boolean;
  files: ChangedFile[];
  stats: DiffStats;
  loading: boolean;
  error: string | null;
  aheadBehind: GitAheadBehind;
  log: GitCommit[];
  logLoading: boolean;
  stashes: StashEntry[];
  stashesLoading: boolean;
}

export interface GitActions {
  refresh: () => Promise<void>;
  switchBranch: (branchName: string) => Promise<void>;
  createBranch: (branchName: string) => Promise<void>;
  stageFiles: (paths: string[]) => Promise<void>;
  unstageFiles: (paths: string[]) => Promise<void>;
  revertFiles: (paths: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  revertAll: () => Promise<void>;
  commit: (message: string) => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  fetch: () => Promise<void>;
  refreshLog: () => Promise<void>;
  refreshStashes: () => Promise<void>;
  mergeBranch: (branch: string, strategy: MergeStrategy) => Promise<void>;
  deleteBranch: (branch: string, force: boolean) => Promise<void>;
  pushDeleteRemote: (branch: string) => Promise<void>;
  stash: (message?: string) => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashDrop: (index: number) => Promise<void>;
  cleanupWorktree: (worktreePath: string, branch: string, deleteRemote: boolean) => Promise<void>;
}

interface UseGitStateOptions {
  cwd: string;
  visible: boolean;
  sessionId?: string | null;
  onSessionBranchChange?: (sessionId: string, branch: string | null) => Promise<void> | void;
}

const emptyStats: DiffStats = { additions: 0, deletions: 0, files_changed: 0 };
const emptyAheadBehind: GitAheadBehind = { ahead: 0, behind: 0 };

export function useGitState({
  cwd,
  visible,
  sessionId,
  onSessionBranchChange,
}: UseGitStateOptions): GitState & GitActions {
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [currentBranchUpstreamStatus, setCurrentBranchUpstreamStatus] = useState<"none" | "tracking" | "gone">("none");
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [stats, setStats] = useState<DiffStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchActionPending, setBranchActionPending] = useState(false);
  const [aheadBehind, setAheadBehind] = useState<GitAheadBehind>(emptyAheadBehind);
  const [log, setLog] = useState<GitCommit[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [stashesLoading, setStashesLoading] = useState(false);

  const branchesLoadedRef = useRef(false);

  // Reset state when cwd changes
  useEffect(() => {
    setBranch("");
    setBranches([]);
    setCurrentBranchUpstreamStatus("none");
    setFiles([]);
    setStats(emptyStats);
    setError(null);
    setBranchesLoading(true);
    setLoading(true);
    setAheadBehind(emptyAheadBehind);
    setLog([]);
    setStashes([]);
    branchesLoadedRef.current = false;
  }, [cwd]);

  const refresh = useCallback(async () => {
    const shouldShowBranchLoading = !branchesLoadedRef.current;

    try {
      setLoading(true);
      if (shouldShowBranchLoading) {
        setBranchesLoading(true);
      }
      setError(null);
      const [status, nextBranches, ab] = await Promise.all([
        gitCommands.status(cwd),
        gitCommands.listBranches(cwd).catch(() => [] as GitBranchInfo[]),
        gitCommands.aheadBehind(cwd).catch(() => emptyAheadBehind),
      ]);
      setBranch(status.branch);
      setBranches(nextBranches);
      const currentBranchInfo =
        nextBranches.find((candidate) => candidate.is_current) ??
        nextBranches.find((candidate) => candidate.name === status.branch);
      setCurrentBranchUpstreamStatus(currentBranchInfo?.upstream_status ?? "none");
      branchesLoadedRef.current = nextBranches.length > 0;
      setFiles(status.files);
      setStats(status.stats);
      setAheadBehind(ab);
    } catch (err) {
      setBranches([]);
      setCurrentBranchUpstreamStatus("none");
      branchesLoadedRef.current = false;
      setError(String(err));
    } finally {
      if (shouldShowBranchLoading) {
        setBranchesLoading(false);
      }
      setLoading(false);
    }
  }, [cwd]);

  const refreshLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const commits = await gitCommands.log(cwd, 50);
      setLog(commits);
    } catch {
      setLog([]);
    } finally {
      setLogLoading(false);
    }
  }, [cwd]);

  const refreshStashes = useCallback(async () => {
    setStashesLoading(true);
    try {
      const entries = await gitCommands.stashList(cwd);
      setStashes(entries);
    } catch {
      setStashes([]);
    } finally {
      setStashesLoading(false);
    }
  }, [cwd]);

  // Auto-refresh when visible
  useEffect(() => {
    if (!visible) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [visible, refresh]);

  const switchBranch = useCallback(async (branchName: string) => {
    if (branchName === branch || branchActionPending) return;

    setBranchActionPending(true);
    try {
      await toast.promise(
        (async () => {
          await gitCommands.checkoutBranch(cwd, branchName);
          await refresh();
          if (sessionId) {
            await onSessionBranchChange?.(sessionId, branchName);
          }
        })(),
        {
          loading: `Switching to ${branchName}...`,
          success: `Switched to ${branchName}`,
          error: (err) => `Failed to switch branch: ${String(err)}`,
        },
      );
    } finally {
      setBranchActionPending(false);
    }
  }, [branch, branchActionPending, cwd, refresh, sessionId, onSessionBranchChange]);

  const createBranch = useCallback(async (branchName: string) => {
    if (branchActionPending) return;

    setBranchActionPending(true);
    try {
      await toast.promise(
        (async () => {
          await gitCommands.createBranch(cwd, branchName);
          const [status, nextBranches] = await Promise.all([
            gitCommands.status(cwd),
            gitCommands.listBranches(cwd).catch(() => branches),
          ]);
          setBranch(status.branch);
          setBranches(nextBranches);
          const currentBranchInfo =
            nextBranches.find((candidate) => candidate.is_current) ??
            nextBranches.find((candidate) => candidate.name === status.branch);
          setCurrentBranchUpstreamStatus(currentBranchInfo?.upstream_status ?? "none");
          setFiles(status.files);
          setStats(status.stats);
          if (sessionId) {
            await onSessionBranchChange?.(sessionId, status.branch ?? branchName);
          }
        })(),
        {
          loading: `Creating ${branchName}...`,
          success: `Created and checked out ${branchName}`,
          error: (err) => `Failed to create branch: ${String(err)}`,
        },
      );
    } finally {
      setBranchActionPending(false);
    }
  }, [branchActionPending, branches, cwd, sessionId, onSessionBranchChange]);

  const stageFiles = useCallback(async (paths: string[]) => {
    await gitCommands.stage(cwd, paths);
    void refresh();
  }, [cwd, refresh]);

  const unstageFiles = useCallback(async (paths: string[]) => {
    await gitCommands.unstage(cwd, paths);
    void refresh();
  }, [cwd, refresh]);

  const revertFiles = useCallback(async (paths: string[]) => {
    await gitCommands.revert(cwd, paths);
    void refresh();
  }, [cwd, refresh]);

  const stageAll = useCallback(async () => {
    const unstaged = files.filter((f) => !f.staged).map((f) => f.path);
    if (unstaged.length === 0) return;
    await gitCommands.stage(cwd, unstaged);
    void refresh();
  }, [cwd, files, refresh]);

  const revertAll = useCallback(async () => {
    const unstaged = files.filter((f) => !f.staged).map((f) => f.path);
    if (unstaged.length === 0) return;
    await gitCommands.revert(cwd, unstaged);
    void refresh();
  }, [cwd, files, refresh]);

  const commit = useCallback(async (message: string) => {
    await toast.promise(
      (async () => {
        await gitCommands.commit(cwd, message);
        await refresh();
      })(),
      {
        loading: "Committing changes...",
        success: "Commit created",
        error: (err) => `Failed to commit: ${String(err)}`,
      },
    );
  }, [cwd, refresh]);

  const pull = useCallback(async () => {
    await toast.promise(
      (async () => {
        await gitCommands.pull(cwd);
        await refresh();
      })(),
      {
        loading: `Pulling ${branch || "current branch"}...`,
        success: `Pulled ${branch || "current branch"}`,
        error: (err) => `Failed to pull: ${String(err)}`,
      },
    );
  }, [cwd, branch, refresh]);

  const push = useCallback(async () => {
    await toast.promise(
      (async () => {
        await gitCommands.push(cwd);
        await refresh();
      })(),
      {
        loading: `Pushing ${branch || "current branch"}...`,
        success: `Pushed ${branch || "current branch"}`,
        error: (err) => `Failed to push: ${String(err)}`,
      },
    );
  }, [cwd, branch, refresh]);

  const fetch = useCallback(async () => {
    await toast.promise(
      (async () => {
        await gitCommands.fetch(cwd);
        await refresh();
      })(),
      {
        loading: "Fetching from origin...",
        success: "Fetched from origin",
        error: (err) => `Failed to fetch: ${String(err)}`,
      },
    );
  }, [cwd, refresh]);

  const mergeBranch = useCallback(async (targetBranch: string, strategy: MergeStrategy) => {
    await toast.promise(
      (async () => {
        await gitCommands.merge(cwd, targetBranch, strategy);
        await refresh();
      })(),
      {
        loading: `Merging ${targetBranch}...`,
        success: `Merged ${targetBranch}`,
        error: (err) => `Merge failed: ${String(err)}`,
      },
    );
  }, [cwd, refresh]);

  const deleteBranch = useCallback(async (targetBranch: string, force: boolean) => {
    await toast.promise(
      (async () => {
        await gitCommands.deleteBranch(cwd, targetBranch, force);
        await refresh();
      })(),
      {
        loading: `Deleting branch ${targetBranch}...`,
        success: `Deleted ${targetBranch}`,
        error: (err) => `Failed to delete branch: ${String(err)}`,
      },
    );
  }, [cwd, refresh]);

  const pushDeleteRemote = useCallback(async (targetBranch: string) => {
    await toast.promise(
      gitCommands.pushDeleteRemote(cwd, targetBranch),
      {
        loading: `Deleting remote branch ${targetBranch}...`,
        success: `Deleted remote ${targetBranch}`,
        error: (err) => `Failed to delete remote branch: ${String(err)}`,
      },
    );
  }, [cwd]);

  const stash = useCallback(async (message?: string) => {
    await toast.promise(
      (async () => {
        await gitCommands.stash(cwd, message);
        await Promise.all([refresh(), refreshStashes()]);
      })(),
      {
        loading: "Stashing changes...",
        success: "Changes stashed",
        error: (err) => `Failed to stash: ${String(err)}`,
      },
    );
  }, [cwd, refresh, refreshStashes]);

  const stashPop = useCallback(async (index?: number) => {
    await toast.promise(
      (async () => {
        await gitCommands.stashPop(cwd, index);
        await Promise.all([refresh(), refreshStashes()]);
      })(),
      {
        loading: "Popping stash...",
        success: "Stash applied",
        error: (err) => `Failed to pop stash: ${String(err)}`,
      },
    );
  }, [cwd, refresh, refreshStashes]);

  const stashDrop = useCallback(async (index: number) => {
    await toast.promise(
      (async () => {
        await gitCommands.stashDrop(cwd, index);
        await refreshStashes();
      })(),
      {
        loading: "Dropping stash...",
        success: "Stash dropped",
        error: (err) => `Failed to drop stash: ${String(err)}`,
      },
    );
  }, [cwd, refreshStashes]);

  const cleanupWorktree = useCallback(async (
    worktreePath: string,
    targetBranch: string,
    deleteRemote: boolean,
  ) => {
    await toast.promise(
      gitCommands.cleanupWorktree(cwd, worktreePath, targetBranch, deleteRemote),
      {
        loading: "Cleaning up worktree...",
        success: "Worktree removed and branch deleted",
        error: (err) => `Cleanup failed: ${String(err)}`,
      },
    );
    await refresh();
  }, [cwd, refresh]);

  return {
    branch,
    branches,
    currentBranchUpstreamStatus,
    branchesLoading,
    branchActionPending,
    files,
    stats,
    loading,
    error,
    aheadBehind,
    log,
    logLoading,
    stashes,
    stashesLoading,
    refresh,
    refreshLog,
    refreshStashes,
    switchBranch,
    createBranch,
    stageFiles,
    unstageFiles,
    revertFiles,
    stageAll,
    revertAll,
    commit,
    pull,
    push,
    fetch,
    mergeBranch,
    deleteBranch,
    pushDeleteRemote,
    stash,
    stashPop,
    stashDrop,
    cleanupWorktree,
  };
}
