import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Language Lab — English knowledge atlas",
  description: "Explore the full Open English WordNet core with a personal, evidence-based learning overlay.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
