import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nsoybean.github.io"),
  title: "Switchboard — Parallel Coding Agents Workspace",
  description:
    "Launch coding agents in isolated worktrees, monitor progress across sessions, and review every change — all from one native macOS app.",
  icons: {
    icon: "/switchboard/app-icon.png",
    apple: "/switchboard/app-icon.png",
  },
  openGraph: {
    title: "Switchboard — Parallel Coding Agents Workspace",
    description:
      "Launch coding agents in isolated worktrees, monitor progress across sessions, and review every change — all from one native macOS app.",
    type: "website",
    images: [
      {
        url: "/switchboard/main_dark_mode.png",
        width: 2786,
        height: 1782,
        alt: "Switchboard workspace showing parallel coding agent sessions with built-in git review",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Switchboard — Parallel Coding Agents Workspace",
    description:
      "Launch coding agents in isolated worktrees, monitor progress across sessions, and review every change — all from one native macOS app.",
    images: ["/switchboard/main_dark_mode.png"],
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
