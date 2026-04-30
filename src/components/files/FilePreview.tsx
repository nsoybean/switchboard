import { useEffect, useId, useState, useRef } from "react";
import { File, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

function isMarkdownFile(path: string): boolean {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  return name.endsWith(".md");
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
  const [markdownPreview, setMarkdownPreview] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewSwitchId = useId();
  const { theme } = useTheme();

  const fileName = filePath.split("/").pop() ?? filePath;
  const language = getLanguage(filePath);
  const canPreviewMarkdown = isMarkdownFile(filePath);
  const showingMarkdownPreview = canPreviewMarkdown && markdownPreview;
  const shikiTheme =
    theme === "dark" ? "github-dark-default" : "github-light-default";

  // Load file content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setHighlightedHtml(null);
    setMarkdownPreview(false);

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
    if (!content || showingMarkdownPreview) return;
    let cancelled = false;

    highlight(content, language, shikiTheme).then((html) => {
      if (!cancelled) setHighlightedHtml(html);
    });

    return () => {
      cancelled = true;
    };
  }, [content, language, shikiTheme, showingMarkdownPreview]);

  return (
    <div className="flex h-full flex-col bg-background font-sans">
      {showHeader ? (
        <div className="flex shrink-0 items-center gap-2 border-b bg-card/85 px-3 py-1.5">
          <File className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium truncate flex-1 font-mono">
            {fileName}
          </span>
          {canPreviewMarkdown ? (
            <Label
              htmlFor={previewSwitchId}
              className="gap-1.5 text-[10px] font-normal text-muted-foreground"
            >
              Preview
              <Switch
                id={previewSwitchId}
                checked={showingMarkdownPreview}
                onCheckedChange={setMarkdownPreview}
                aria-label="Toggle markdown preview"
              />
            </Label>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">
              {language}
            </span>
          )}
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
      {canPreviewMarkdown && !showHeader ? (
        <div className="flex shrink-0 items-center justify-end border-b bg-card/85 px-3 py-1.5">
          <Label
            htmlFor={previewSwitchId}
            className="gap-1.5 text-[10px] font-normal text-muted-foreground"
          >
            Preview
            <Switch
              id={previewSwitchId}
              checked={showingMarkdownPreview}
              onCheckedChange={setMarkdownPreview}
              aria-label="Toggle markdown preview"
            />
          </Label>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-auto">
        {loading && (
          <div className="p-4 text-xs text-muted-foreground">Loading...</div>
        )}
        {error && (
          <div className="p-4 text-xs text-destructive">{error}</div>
        )}
        {content !== null && showingMarkdownPreview ? (
          <MarkdownPreview content={content} />
        ) : null}
        {content !== null && !showingMarkdownPreview && highlightedHtml ? (
          <div
            ref={containerRef}
            className="shiki-preview text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:m-0 [&_code]:font-[JetBrains_Mono,monospace] [&_.line]:before:content-[attr(data-line)] [&_.line]:before:inline-block [&_.line]:before:w-10 [&_.line]:before:text-right [&_.line]:before:pr-4 [&_.line]:before:text-[var(--foreground)]/20 [&_.line]:before:select-none"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : content !== null && !showingMarkdownPreview ? (
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

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-5 font-sans text-sm leading-6 text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 border-b pb-2 text-2xl font-semibold leading-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-6 border-b pb-1.5 text-xl font-semibold leading-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-5 text-base font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-2 mt-4 text-sm font-semibold">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 whitespace-pre-wrap break-words">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="whitespace-normal break-words">{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.startsWith("language-");

            if (isBlock) {
              return (
                <code className="font-mono text-[12px] leading-relaxed">
                  {children}
                </code>
              );
            }

            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-md border bg-muted/40 p-3">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-5 border-border" />,
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border px-2 py-1.5 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border px-2 py-1.5 align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
