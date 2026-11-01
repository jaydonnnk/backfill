import type { Metadata } from "next";
import Link from "next/link";
import { Gloock, Manrope } from "next/font/google";
import "./globals.css";

const display = Gloock({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Backfill",
  description: "AI agents pool committed spend; small merchants sell spoiling off-peak capacity to them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="antialiased">
        <a className="skip-link" href="#content">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="wordmark" aria-label="Backfill home"><span aria-hidden="true">b.</span> Backfill</Link>
          <nav aria-label="Main navigation">
            <Link href="/demo">Live</Link><Link href="/evals">Evals</Link><Link href="/merchant">Merchants</Link><Link href="/#how-it-works">How it works</Link>
          </nav>
        </header>
        <div id="content">{children}</div>
        <footer className="site-footer"><span>Backfill · Singapore</span><Link href="/system">System diagnostics</Link></footer>
      </body>
    </html>
  );
}
