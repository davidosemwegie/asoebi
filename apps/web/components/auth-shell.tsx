import Image from "next/image"
import Link from "next/link"

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,0.95fr)_minmax(34rem,1.05fr)]">
        <section className="flex min-h-svh min-w-0 flex-col px-4 py-7 min-[280px]:px-6 sm:px-10 sm:py-9 lg:px-12 lg:py-10 xl:px-16">
          <Link
            href="/"
            className="inline-flex min-h-11 max-w-full items-center rounded-lg px-1 font-display text-xl font-medium tracking-tight text-brand-blackberry outline-none hover:text-brand-aubergine focus-visible:ring-3 focus-visible:ring-ring/50 min-[280px]:text-2xl"
          >
            Aso Circle
          </Link>

          <div className="flex flex-1 items-center py-12 lg:py-16">
            <div className="mx-auto w-full max-w-md">
              <h1 className="font-display text-4xl leading-none font-medium tracking-tight text-balance [overflow-wrap:anywhere] min-[360px]:text-5xl sm:text-6xl">
                {title}
              </h1>
              <p className="mt-5 max-w-sm text-lg leading-7 text-pretty [overflow-wrap:anywhere] text-muted-foreground">
                {description}
              </p>
              <div className="mt-9">{children}</div>
            </div>
          </div>

          <p className="hidden text-base text-muted-foreground sm:block">
            Secure access to your events and orders
          </p>
        </section>

        <aside className="hidden p-3 pl-0 lg:block">
          <div className="relative h-full min-h-[calc(100svh-1.5rem)] overflow-hidden rounded-2xl border border-border bg-muted">
            <Image
              src="/images/aso-oke-editorial.jpg"
              alt="Handwoven Nigerian Aso Oke textiles in rich celebration colours"
              fill
              sizes="(min-width: 1024px) 55vw, 0px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/10" aria-hidden="true" />
            <div className="absolute right-8 bottom-8 left-8 max-w-md text-white [text-shadow:0_1px_18px_rgb(0_0_0/35%)]">
              <p className="text-base font-medium">Nigerian Aso Oke</p>
              <p className="mt-3 font-display text-4xl leading-tight font-medium tracking-tight text-balance">
                Woven for celebration.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
