export function Footer() {
  return (
    <footer className="border-t border-border/40 py-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6">
        <span className="text-xs text-muted-foreground">
          MIT License &middot; Switchboard
        </span>
        <a
          href="https://github.com/nsoybean/switchboard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
