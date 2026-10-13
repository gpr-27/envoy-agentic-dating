import { initials } from "@/lib/ui/format";

function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** Person portrait: captured photo (data URL) or an initials monogram. */
export function Avatar({
  name,
  src,
  size = 40,
  shape = "round",
  ring,
  className = "",
  eager,
}: {
  name: string;
  src: string | null | undefined;
  size?: number;
  shape?: "round" | "arch";
  ring?: "rose" | "gold";
  className?: string;
  eager?: boolean;
}) {
  const radius = shape === "arch" ? "arch" : "rounded-full";
  const ringCls = ring === "rose" ? "ring-2 ring-rose" : ring === "gold" ? "ring-2 ring-gold" : "ring-1 ring-line";
  const h = shape === "arch" ? Math.round(size * 1.25) : size;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`Photo of ${name}`}
        width={size}
        height={h}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`${radius} ${ringCls} shrink-0 object-cover bg-ink-3 ${className}`}
        style={{ width: size, height: h }}
      />
    );
  }
  const hh = hue(name);
  return (
    <span
      role="img"
      aria-label={name}
      className={`${radius} ${ringCls} font-display shrink-0 inline-flex items-center justify-center select-none text-cream ${className}`}
      style={{
        width: size,
        height: h,
        fontSize: Math.max(11, size * 0.38),
        background: `linear-gradient(160deg, oklch(0.45 0.09 ${hh}), oklch(0.28 0.06 ${(hh + 40) % 360}))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
