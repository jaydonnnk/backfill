import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backfill",
  description: "AI agents pool committed spend; small merchants sell spoiling off-peak capacity to them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
