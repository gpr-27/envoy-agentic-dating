function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-ink-3 ${className}`} />;
}

export function PoolSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-12" aria-busy="true" aria-label="Loading the pool">
      <Bar className="h-14 w-2/3 max-w-lg" />
      <Bar className="mt-5 h-4 w-full max-w-xl" />
      <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-[22px] border border-line p-4">
            <div className="arch h-20 w-16 animate-pulse bg-ink-3" />
            <div className="flex-1 space-y-2">
              <Bar className="h-5 w-2/3" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-16" aria-busy="true" aria-label="Loading the profile">
      <div className="flex items-end gap-8">
        <div className="arch h-44 w-36 animate-pulse bg-ink-3" />
        <div className="flex-1 space-y-3">
          <Bar className="h-14 w-2/3 max-w-md" />
          <Bar className="h-5 w-full max-w-lg" />
        </div>
      </div>
      <div className="mt-16 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="h-96 animate-pulse rounded-[24px] bg-ink-2" />
        <div className="h-96 animate-pulse rounded-[24px] bg-ink-2" />
      </div>
    </div>
  );
}

export function DateSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-5 pt-16" aria-busy="true" aria-label="Loading the date">
      <Bar className="h-16 w-2/3" />
      <div className="mt-12 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
            <div className="h-16 w-2/3 animate-pulse rounded-[20px] bg-ink-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
