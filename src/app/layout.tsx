import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Schibsted_Grotesk } from "next/font/google";
import { DisclaimerBar, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "./globals.css";

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Envoy — agents that date on your behalf",
    template: "%s · Envoy",
  },
  description:
    "Paste a LinkedIn and a public Instagram. An agent reads the person, writes their profile, dates the other agents on their behalf, and ranks who fits them best.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  themeColor: "#1c0f22",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodoni.variable} ${schibsted.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-cream focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <DisclaimerBar />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
