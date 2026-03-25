import { invoke } from "@tauri-apps/api/core";

export interface ChangedFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  files_changed: number;
}

export interface GitStatusResult {
  branch: string;
  files: ChangedFile[];
  stats: DiffStats;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export const gitCommands = {
  status: (cwd: string) =>
    invoke<GitStatusResult>("git_status", { cwd }),
  diff: (cwd: string, file?: string, staged = false) =>
    invoke<string>("git_diff", { cwd, file, staged }),
  stage: (cwd: string, files: string[]) =>
    invoke<void>("git_stage", { cwd, files }),
  unstage: (cwd: string, files: string[]) =>
    invoke<void>("git_unstage", { cwd, files }),
  revert: (cwd: string, files: string[]) =>
    invoke<void>("git_revert_files", { cwd, files }),
  commit: (cwd: string, message: string) =>
    invoke<string>("git_commit", { cwd, message }),
  push: (cwd: string) =>
    invoke<string>("git_push", { cwd }),
  createBranch: (cwd: string, name: string) =>
    invoke<void>("git_create_branch", { cwd, name }),
  createPr: (cwd: string, title: string, body: string, base: string) =>
    invoke<string>("git_create_pr", { cwd, title, body, base }),
};

export const worktreeCommands = {
  create: (repoPath: string, branchName: string, label: string) =>
    invoke<WorktreeInfo>("create_worktree", { repoPath, branchName, label }),
  remove: (repoPath: string, worktreePath: string) =>
    invoke<void>("remove_worktree", { repoPath, worktreePath }),
  list: (repoPath: string) =>
    invoke<WorktreeInfo[]>("list_worktrees", { repoPath }),
};
