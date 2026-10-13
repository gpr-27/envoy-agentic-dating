import { notFound } from "next/navigation";
import { FrozenBanner } from "@/components/SiteChrome";
import { isFrozen, isPool } from "@/lib/store";

export default async function PoolLayout({ children, params }: LayoutProps<"/pool/[pool]">) {
  const { pool } = await params;
  if (!isPool(pool)) notFound();
  const frozen = await isFrozen(pool);
  return (
    <>
      {frozen && <FrozenBanner />}
      {children}
    </>
  );
}
