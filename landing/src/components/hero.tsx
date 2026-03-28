export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
        <div className="h-[600px] w-[800px] rounded-full bg-accent/8 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6">
        {/* Badge */}
        <div className="flex justify-center">
          <a
            href="https://github.com/nsoybean/switchboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Open source on GitHub
          </a>
        </div>

        {/* Headline */}
        <h1 className="mx-auto mt-6 max-w-2xl text-center text-3xl font-semibold leading-[1.15] tracking-tight sm:text-[2.75rem]">
          The open-source
          <br />
          multi-agent workspace
        </h1>

        {/* Sub-headline */}
        <p className="mx-auto mt-5 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
          Run multiple AI coding sessions in parallel with isolated worktrees,
          live terminals, and native git workflows — all from one window.
        </p>

        {/* CTA */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href="https://github.com/nsoybean/switchboard/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-md bg-foreground px-3.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
          >
            Download for macOS
          </a>
          <a
            href="https://github.com/nsoybean/switchboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-md border border-border px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View on GitHub
          </a>
        </div>

        {/* Product screenshot */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-2xl shadow-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/switchboard/hero-shot.png"
              alt="Switchboard — multi-agent workspace interface"
              width={1920}
              height={1080}
              className="w-full"
            />
          </div>
          {/* Reflection fade */}
          <div className="pointer-events-none absolute -bottom-px left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </div>
      </div>
    </section>
  );
}
