"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/pool/demo", label: "Demo", match: (p: string) => p.startsWith("/pool/demo") && !p.endsWith("/rankings") },
  { href: "/#add", label: "Try it", match: (p: string) => p.startsWith("/pool/live") },
  { href: "/pool/demo/rankings", label: "Rankings", match: (p: string) => p === "/pool/demo/rankings" },
  { href: "/how-it-works", label: "How it works", match: (p: string) => p.startsWith("/how-it-works") },
];

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="-mx-1 flex items-center gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${
              active ? "bg-cream text-ink" : "text-mute hover:bg-ink-3 hover:text-cream"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
