import { useState, useEffect } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  GitPullRequest,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { settingsCommands } from "../../lib/tauri-commands";
import { useAppState, useAppDispatch } from "../../state/context";
import { toast } from "sonner";

interface SettingsPageProps {
  onBack: () => void;
  currentVersion: string | null;
  updateVersion: string | null;
  updateNotes?: string;
  checkingForUpdates: boolean;
  installingUpdate: boolean;
  updateProgress: number | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
}

export function SettingsPage({
  onBack,
  currentVersion,
  updateVersion,
  updateNotes,
  checkingForUpdates,
  installingUpdate,
  updateProgress,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsPageProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);

  // Load existing token
  useEffect(() => {
    if (state.githubToken) {
      setToken(state.githubToken);
      // Validate to show username
      settingsCommands
        .validateGitHubToken(state.githubToken)
        .then((username) => setGithubUser(username))
        .catch(() => setGithubUser(null));
    }
  }, [state.githubToken]);

  const handleSaveToken = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      // Clear token
      await settingsCommands.setGitHubToken("");
      dispatch({ type: "SET_GITHUB_TOKEN", token: null });
      setGithubUser(null);
      toast.success("GitHub token removed");
      return;
    }

    setValidating(true);
    try {
      const username = await settingsCommands.validateGitHubToken(trimmed);
      await settingsCommands.setGitHubToken(trimmed);
      dispatch({ type: "SET_GITHUB_TOKEN", token: trimmed });
      setGithubUser(username);
      toast.success(`Authenticated as ${username}`);
    } catch (err) {
      toast.error("Invalid token", {
        description: String(err),
      });
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveToken = async () => {
    setToken("");
    await settingsCommands.setGitHubToken("");
    dispatch({ type: "SET_GITHUB_TOKEN", token: null });
    setGithubUser(null);
    toast.success("GitHub token removed");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
        <Button variant="ghost" size="icon" className="size-8" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto py-8 px-6">
          <section>
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="size-4" />
              <h2 className="text-sm font-semibold">Project</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Switchboard is currently focused on this git repository.
            </p>

            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">Selected project repo</p>
              {state.projectPath ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="mt-1 truncate font-mono text-sm" title={state.projectPath}>
                      {state.projectPath}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>{state.projectPath}</TooltipContent>
                </Tooltip>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No project selected</p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Saved projects: {state.projects.length}
              </p>
            </div>
          </section>

          <Separator className="my-8" />

          <section>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div>
                <h2 className="text-sm font-semibold">App Updates</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Switchboard checks GitHub Releases on launch and shows an
                  update button in the titlebar when a newer version exists.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onCheckForUpdates}
                disabled={checkingForUpdates || installingUpdate}
              >
                {checkingForUpdates ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Check for Updates
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/30 px-4 py-3 mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Current version</p>
                  <p className="text-sm font-medium">{currentVersion ?? "Loading..."}</p>
                </div>

                {updateVersion ? (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={onInstallUpdate}
                    disabled={checkingForUpdates || installingUpdate}
                  >
                    {installingUpdate ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="size-3.5" />
                    )}
                    {installingUpdate && updateProgress !== null
                      ? `Installing ${updateProgress}%`
                      : `Install ${updateVersion}`}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No pending update
                  </span>
                )}
              </div>

              {updateVersion && (
                <div className="rounded-md border bg-background px-3 py-2">
                  <p className="text-xs font-medium">
                    Update available: {updateVersion}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    {updateNotes?.trim() ||
                      "Download and install the latest signed GitHub release, then restart the app automatically."}
                  </p>
                </div>
              )}
            </div>
          </section>

          <Separator className="my-8" />

          {/* GitHub Section */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest className="size-4" />
              <h2 className="text-sm font-semibold">GitHub</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Add a personal access token to create pull requests directly from Switchboard.
            </p>

            <div className="flex flex-col gap-3">
              {/* Token input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Personal Access Token
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="pr-10 font-mono text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveToken}
                    disabled={validating || token.trim() === (state.githubToken ?? "")}
                  >
                    {validating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>

              {/* Status */}
              {githubUser && (
                <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Check className="size-3.5 text-green-500" />
                    <span className="text-xs">
                      Authenticated as <span className="font-medium">{githubUser}</span>
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive h-auto py-1"
                    onClick={handleRemoveToken}
                  >
                    Remove
                  </Button>
                </div>
              )}

              {/* Help text */}
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                <p>
                  Create a token at{" "}
                  <button
                    onClick={() => {
                      import("@tauri-apps/plugin-shell").then((mod) =>
                        mod.open("https://github.com/settings/tokens/new?scopes=repo&description=Switchboard")
                      );
                    }}
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    GitHub Settings
                    <ExternalLink className="inline size-2.5 ml-0.5 -mt-0.5" />
                  </button>
                  {" "}with the <span className="font-mono bg-muted px-1 rounded">repo</span> scope.
                </p>
              </div>
            </div>
          </section>

          <Separator className="my-8" />

          {/* Placeholder for future settings */}
          <section className="text-xs text-muted-foreground">
            More settings coming soon.
          </section>
        </div>
      </div>
    </div>
  );
}
