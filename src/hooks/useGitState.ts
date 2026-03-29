import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitCommands,
  type ChangedFile,
  type DiffStats,
  type GitBranchInfo,
} from "../lib/tauri-commands";
import { toast } from "sonner";

export interface GitState {
  branch: string;
  branches: GitBranchInfo[];
  branchesLoading: boolean;
  branchActionPending: boolean;
  files: ChangedFile[];
  stats: DiffStats;
  loading: boolean;
  error: string | null;
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
}

interface UseGitStateOptions {
  cwd: string;
  visible: boolean;
  sessionId?: string | null;
  onSessionBranchChange?: (sessionId: string, branch: string | null) => Promise<void> | void;
}

const emptyStats: DiffStats = { additions: 0, deletions: 0, files_changed: 0 };

export function useGitState({
  cwd,
  visible,
  sessionId,
  onSessionBranchChange,
}: UseGitStateOptions): GitState & GitActions {
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [stats, setStats] = useState<DiffStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchActionPending, setBranchActionPending] = useState(false);

  const branchesLoadedRef = useRef(false);

  // Reset state when cwd changes
  useEffect(() => {
    setBranch("");
    setBranches([]);
    setFiles([]);
    setStats(emptyStats);
    setError(null);
    setBranchesLoading(true);
    setLoading(true);
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
      const status = await gitCommands.status(cwd);
      const nextBranches = await gitCommands.listBranches(cwd).catch(() => []);
      setBranch(status.branch);
      setBranches(nextBranches);
      branchesLoadedRef.current = nextBranches.length > 0;
      setFiles(status.files);
      setStats(status.stats);
    } catch (err) {
      setBranches([]);
      branchesLoadedRef.current = false;
      setError(String(err));
    } finally {
      if (shouldShowBranchLoading) {
        setBranchesLoading(false);
      }
      setLoading(false);
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
          const status = await gitCommands.status(cwd);
          setBranch(status.branch);
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
  }, [branchActionPending, cwd, sessionId, onSessionBranchChange]);

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
    const unstaged = files.filter((f) => !f.staged && f.status !== "??").map((f) => f.path);
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

  return {
    branch,
    branches,
    branchesLoading,
    branchActionPending,
    files,
    stats,
    loading,
    error,
    refresh,
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
  };
}
