import { Skeleton } from "@workspace/ui/components/skeleton"

export default function PublicEventLoading() {
  return (
    <main className="min-h-dvh bg-muted/30" aria-busy="true">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-6 aspect-[16/7] w-full rounded-xl" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <Skeleton className="h-12 w-4/5" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
      <span className="sr-only">Loading event details</span>
    </main>
  )
}
