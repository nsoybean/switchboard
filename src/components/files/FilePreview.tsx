import { useEffect, useState, useRef } from "react";
import { File, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { fileCommands } from "../../lib/tauri-commands";
import { createHighlighter, type Highlighter } from "shiki";

interface FilePreviewProps {
  filePath: string;
  onClose?: () => void;
  showHeader?: boolean;
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  json: "json",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  css: "css",
  html: "html",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  lock: "json",
  sql: "sql",
  go: "go",
  java: "java",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  xml: "xml",
  svg: "xml",
  dockerfile: "dockerfile",
  makefile: "makefile",
  graphql: "graphql",
};

function getLanguage(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  // Handle files without extensions
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const ext = name.split(".").pop() ?? "";
  return LANG_MAP[ext] ?? "text";
}

/** Lazy singleton highlighter */
let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark-default", "github-light-default"],
      langs: [],
    });
  }
  return highlighterPromise;
}

async function highlight(
  code: string,
  lang: string,
  theme: string,
): Promise<string> {
  const highlighter = await getHighlighter();

  // Lazy-load language grammar
  if (lang !== "text" && !loadedLangs.has(lang)) {
    try {
      await highlighter.loadLanguage(lang as Parameters<typeof highlighter.loadLanguage>[0]);
      loadedLangs.add(lang);
    } catch {
      // Language not supported, fall back to text
      lang = "text";
    }
  }

  return highlighter.codeToHtml(code, {
    lang: lang === "text" ? "text" : lang,
    theme,
  });
}

export function FilePreview({
  filePath,
  onClose,
  showHeader = true,
}: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const fileName = filePath.split("/").pop() ?? filePath;
  const language = getLanguage(filePath);
  const shikiTheme =
    theme === "dark" ? "github-dark-default" : "github-light-default";

  // Load file content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setHighlightedHtml(null);

    fileCommands
      .readFile(filePath)
      .then((data) => {
        if (!cancelled) {
          setContent(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Highlight when content or theme changes
  useEffect(() => {
    if (!content) return;
    let cancelled = false;

    highlight(content, language, shikiTheme).then((html) => {
      if (!cancelled) setHighlightedHtml(html);
    });

    return () => {
      cancelled = true;
    };
  }, [content, language, shikiTheme]);

  return (
    <div className="flex flex-col h-full bg-background">
      {showHeader ? (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-card shrink-0">
          <File className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium truncate flex-1 font-mono">
            {fileName}
          </span>
          <span className="text-[10px] text-muted-foreground/60">{language}</span>
          {onClose ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && (
          <div className="p-4 text-xs text-muted-foreground">Loading...</div>
        )}
        {error && (
          <div className="p-4 text-xs text-destructive">{error}</div>
        )}
        {content !== null && highlightedHtml ? (
          <div
            ref={containerRef}
            className="shiki-preview text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:m-0 [&_code]:font-[JetBrains_Mono,monospace] [&_.line]:before:content-[attr(data-line)] [&_.line]:before:inline-block [&_.line]:before:w-10 [&_.line]:before:text-right [&_.line]:before:pr-4 [&_.line]:before:text-[var(--foreground)]/20 [&_.line]:before:select-none"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : content !== null ? (
          /* Fallback while shiki loads */
          <pre className="p-4 text-[13px] font-[JetBrains_Mono,monospace] leading-relaxed whitespace-pre-wrap break-words">
            {content.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="inline-block w-10 shrink-0 text-right pr-4 text-muted-foreground/20 select-none">
                  {i + 1}
                </span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
