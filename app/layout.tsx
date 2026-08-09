import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "URLCAP — tab to screenshot, GIF, or video",
  description:
    "Point it at a URL, capture the tab, export a screenshot, GIF, or video. Runs entirely in your browser — no backend, no uploads.",
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
