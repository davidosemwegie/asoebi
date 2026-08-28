"use client"

import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"

const pageTitles: Record<string, string> = {
  "/": "Home",
  "/settings": "Settings",
}

export function PageHeader() {
  const pathname = usePathname()
  const title =
    pageTitles[pathname] ??
    (pathname.endsWith("/setup")
      ? "Event setup"
      : pathname.includes("/guests")
        ? "Guests"
        : pathname.endsWith("/orders")
          ? "Orders"
          : pathname.endsWith("/catalog")
            ? "Items"
            : pathname.startsWith("/events/")
              ? "Event overview"
              : "Aso Circle")

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:border-b-0">
      <div className="flex items-center gap-2 px-5 md:px-8 lg:px-12">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-sm font-medium text-muted-foreground">
                {title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
