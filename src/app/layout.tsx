import type { Metadata } from "next";
import Link from "next/link";
import { Silkscreen, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { KopiMark } from "@/components/kopi";
import { KopiProvider } from "@/components/kopi-companion";

const display = Silkscreen({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display", display: "swap" });
const sans = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Backfill",
  description: "AI agents pool committed spend; small merchants sell spoiling off-peak capacity to them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="antialiased"><KopiProvider>
        <a className="skip-link" href="#content">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="wordmark" aria-label="Backfill home"><KopiMark /> Backfill</Link>
          <nav aria-label="Main navigation">
            <Link href="/demo">Live</Link><Link href="/evals">Why Spark</Link><Link href="/merchant">Merchants</Link><Link href="/#how-it-works">How it works</Link>
          </nav>
        </header>
        <div id="content">{children}</div>
        <footer className="site-footer"><span>Backfill · Singapore</span><Link href="/system">System diagnostics</Link></footer>
      </KopiProvider></body>
    </html>
  );
}
