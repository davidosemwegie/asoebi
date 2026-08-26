"use client"

import * as React from "react"
import Link from "next/link"
import type { Preloaded } from "convex/react"
import {
  CalendarDaysIcon,
  HomeIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"
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
      icon: HomeIcon,
    },
    {
      title: "Events",
      url: "/events/new",
      icon: CalendarDaysIcon,
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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <SparklesIcon aria-hidden="true" />
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">Asoebi</span>
                <span className="truncate text-xs text-muted-foreground">
                  Celebration workspace
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
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
