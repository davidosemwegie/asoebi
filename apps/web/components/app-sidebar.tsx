"use client"

import * as React from "react"
import Link from "next/link"
import type { Preloaded } from "convex/react"
import { HouseIcon, Settings2Icon, SparklesIcon } from "lucide-react"
import { usePreloadedAuthQuery } from "@convex-dev/better-auth/nextjs/client"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

const data = {
  navMain: [
    {
      title: "Home",
      url: "/",
      icon: HouseIcon,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2Icon,
    },
  ],
}

export function AppSidebar({
  preloadedUser,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  preloadedUser: Preloaded<typeof api.auth.getCurrentUser>
}) {
  const user = usePreloadedAuthQuery(preloadedUser)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-5 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-plum text-brand-powder">
                <SparklesIcon aria-hidden="true" />
              </span>
              <span className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-display text-lg font-medium tracking-tight">
                  Aso Circle
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/70 pt-3">
        {user ? (
          <NavUser user={user} />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
