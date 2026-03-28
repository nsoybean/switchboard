import { useState, useEffect } from "react";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  GitPullRequest,
  Loader2,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { settingsCommands, hookCommands } from "../../lib/tauri-commands";
import { useAppState, useAppDispatch } from "../../state/context";
import { toast } from "sonner";

export function IntegrationSettings() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [hookPort, setHookPort] = useState<number | null>(null);

  // Load existing token
  useEffect(() => {
    if (state.githubToken) {
      setToken(state.githubToken);
      settingsCommands
        .validateGitHubToken(state.githubToken)
        .then((username) => setGithubUser(username))
        .catch(() => setGithubUser(null));
    }
  }, [state.githubToken]);

  // Load hook server port
  useEffect(() => {
    hookCommands.getPort().then(setHookPort).catch(() => {});
  }, []);

  const handleSaveToken = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
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
      toast.error("Invalid token", { description: String(err) });
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
    <>
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

          <div className="text-[11px] text-muted-foreground leading-relaxed">
            <p>
              Create a token at{" "}
              <button
                onClick={() => {
                  import("@tauri-apps/plugin-shell").then((mod) =>
                    mod.open(
                      "https://github.com/settings/tokens/new?scopes=repo&description=Switchboard",
                    ),
                  );
                }}
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                GitHub Settings
                <ExternalLink className="inline size-2.5 ml-0.5 -mt-0.5" />
              </button>{" "}
              with the <span className="font-mono bg-muted px-1 rounded">repo</span> scope.
            </p>
          </div>
        </div>
      </section>

      {/* TODO: Claude Hooks section — auto-configured, not user-facing yet
      <Separator className="my-8" />
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Radio className="size-4" />
          <h2 className="text-sm font-semibold">Claude Hooks</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Real-time session status updates from Claude Code via HTTP hooks. Auto-configured when
          launching sessions.
        </p>
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--sb-status-running)]" />
            <p className="text-xs text-muted-foreground">Hook server active</p>
          </div>
          {hookPort && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              127.0.0.1:{hookPort}
            </p>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Hook configuration is written to{" "}
            <span className="font-mono bg-muted px-1 rounded">.claude/settings.local.json</span>{" "}
            automatically.
          </p>
        </div>
      </section>
      */}
    </>
  );
}
