import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const sans = Figtree({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Backfill",
  description: "AI agents pool committed spend; small merchants sell spoiling off-peak capacity to them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
