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
  createPr: (cwd: string, title: string, body: string, base: string, token: string) =>
    invoke<string>("git_create_pr", { cwd, title, body, base, token }),
};

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

export const fileCommands = {
  listDirectory: (path: string) =>
    invoke<FileEntry[]>("list_directory", { path }),
  readFile: (path: string) =>
    invoke<string>("read_file_contents", { path }),
};

export const projectCommands = {
  getPath: () => invoke<string | null>("get_project_path"),
  setPath: (path: string) => invoke<void>("set_project_path", { path }),
};

export const settingsCommands = {
  getGitHubToken: () => invoke<string | null>("get_github_token"),
  setGitHubToken: (token: string) => invoke<void>("set_github_token", { token }),
  validateGitHubToken: (token: string) => invoke<string>("validate_github_token", { token }),
};

export const worktreeCommands = {
  create: (repoPath: string, branchName: string, label: string) =>
    invoke<WorktreeInfo>("create_worktree", { repoPath, branchName, label }),
  remove: (repoPath: string, worktreePath: string) =>
    invoke<void>("remove_worktree", { repoPath, worktreePath }),
  list: (repoPath: string) =>
    invoke<WorktreeInfo[]>("list_worktrees", { repoPath }),
};
