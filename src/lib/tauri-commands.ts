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

export interface GitBranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export interface PersistedSession {
  id: string;
  agent: string;
  label: string;
  status?: string | null;
  exit_code?: number | null;
  resume_target_id?: string | null;
  worktree_path?: string | null;
  branch?: string | null;
  repo_root?: string | null;
  launch_root?: string | null;
  display_path?: string | null;
  workspace_kind?: string | null;
  base_branch?: string | null;
  head_kind?: string | null;
  cwd: string;
  created_at: string;
  command: string;
  args: string[];
}

export const gitCommands = {
  status: (cwd: string) =>
    invoke<GitStatusResult>("git_status", { cwd }),
  listBranches: (cwd: string) =>
    invoke<GitBranchInfo[]>("git_list_branches", { cwd }),
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
  pull: (cwd: string) =>
    invoke<string>("git_pull", { cwd }),
  push: (cwd: string) =>
    invoke<string>("git_push", { cwd }),
  createBranch: (cwd: string, name: string) =>
    invoke<void>("git_create_branch", { cwd, name }),
  checkoutBranch: (cwd: string, name: string) =>
    invoke<void>("git_checkout_branch", { cwd, name }),
  createPr: (cwd: string, title: string, body: string, base: string, token: string) =>
    invoke<string>("git_create_pr", { cwd, title, body, base, token }),
};

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

export interface DirectoryStatus {
  path: string;
  exists: boolean;
  is_dir: boolean;
  canonical_path: string | null;
}

export const fileCommands = {
  listDirectory: (path: string) =>
    invoke<FileEntry[]>("list_directory", { path }),
  inspectDirectory: (path: string) =>
    invoke<DirectoryStatus>("inspect_directory", { path }),
  readFile: (path: string) =>
    invoke<string>("read_file_contents", { path }),
};

export const projectCommands = {
  getPath: () => invoke<string | null>("get_project_path"),
  setPath: (path: string) => invoke<void>("set_project_path", { path }),
  listPaths: () => invoke<string[]>("list_project_paths"),
  addPath: (path: string) => invoke<void>("add_project_path", { path }),
  removePath: (path: string) => invoke<void>("remove_project_path", { path }),
};

export const sessionCommands = {
  load: () => invoke<PersistedSession[]>("load_sessions"),
};

export const settingsCommands = {
  getGitHubToken: () => invoke<string | null>("get_github_token"),
  setGitHubToken: (token: string) => invoke<void>("set_github_token", { token }),
  validateGitHubToken: (token: string) => invoke<string>("validate_github_token", { token }),
  getNotificationPrefs: () => invoke<NotificationPrefs>("get_notification_prefs"),
  setNotificationPrefs: (prefs: NotificationPrefs) =>
    invoke<void>("set_notification_prefs", { prefs }),
};

export interface NotificationPrefs {
  native_enabled: boolean;
  notch_enabled: boolean;
  sound_enabled: boolean;
  statuses: {
    idle: boolean;
    done: boolean;
    error: boolean;
    needs_input: boolean;
    stopped: boolean;
  };
}

export const hookCommands = {
  getPort: () => invoke<number>("get_hook_port"),
  getToken: () => invoke<string>("get_hook_token"),
  writeConfig: (cwd: string, port: number) =>
    invoke<void>("write_claude_hook_config", { cwd, port }),
  writeCodexConfig: (cwd: string, port: number) =>
    invoke<void>("write_codex_hook_config", { cwd, port }),
};

export const worktreeCommands = {
  create: (
    repoPath: string,
    branchName: string,
    label: string,
    baseBranch?: string | null,
  ) =>
    invoke<WorktreeInfo>("create_worktree", {
      repoPath,
      branchName,
      label,
      baseBranch,
    }),
  remove: (repoPath: string, worktreePath: string) =>
    invoke<void>("remove_worktree", { repoPath, worktreePath }),
  list: (repoPath: string) =>
    invoke<WorktreeInfo[]>("list_worktrees", { repoPath }),
};
