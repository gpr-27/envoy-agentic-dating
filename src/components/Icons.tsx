import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  focusable: false,
});

export function LinkedInIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.6h.06c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.77 2.5 4.77 5.76v5.6h-4v-4.96c0-1.18-.02-2.7-1.7-2.7-1.7 0-1.96 1.28-1.96 2.61v5.05h-4v-11Z" />
    </svg>
  );
}

export function InstagramIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BothIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </svg>
  );
}

export function SourceIcon({ source, size }: { source: string; size?: number }) {
  if (source === "linkedin") return <LinkedInIcon size={size} />;
  if (source === "instagram") return <InstagramIcon size={size} />;
  return <BothIcon size={size} />;
}

export function HeartIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="currentColor">
      <path d="M12 20.3 4.6 13.2A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 7.4 6.6L12 20.3Z" />
    </svg>
  );
}

export function PlayIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="currentColor">
      <path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.2 4.1a.8.8 0 0 0-1.2.7Z" />
    </svg>
  );
}

export function PauseIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="currentColor">
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </svg>
  );
}

export function ExternalIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function PinIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

export function CheckIcon({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
