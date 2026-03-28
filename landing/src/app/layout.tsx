import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Switchboard — Open-Source Multi-Agent Orchestrator",
  description:
    "Run multiple AI coding agent sessions in parallel with isolated worktrees, live PTY terminals, and native git workflow management.",
  openGraph: {
    title: "Switchboard — Open-Source Multi-Agent Orchestrator",
    description:
      "Run multiple AI coding agent sessions in parallel with isolated worktrees, live PTY terminals, and native git workflow management.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
