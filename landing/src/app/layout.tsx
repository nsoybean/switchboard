import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Switchboard — Open-Source Multi-Agent Workspace",
  description:
    "Run multiple AI coding agent sessions in parallel with isolated worktrees, live PTY terminals, and native git workflow management.",
  openGraph: {
    title: "Switchboard — Open-Source Multi-Agent Workspace",
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
  const themeInitScript = `
    (() => {
      try {
        const storedTheme = window.localStorage.getItem("theme");
        const theme = storedTheme === "dark" ? "dark" : "light";
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(theme);
        root.style.colorScheme = theme;
      } catch {
        document.documentElement.classList.add("light");
        document.documentElement.style.colorScheme = "light";
      }
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
