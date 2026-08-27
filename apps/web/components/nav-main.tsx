"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
  }[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive =
            item.url === "/"
              ? pathname === item.url
              : pathname.startsWith(item.url)
          const Icon = item.icon

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={<Link href={item.url} />}
                isActive={isActive}
                tooltip={item.title}
                className="relative before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent data-active:text-brand-plum data-active:before:bg-brand-plum dark:data-active:text-brand-powder dark:data-active:before:bg-brand-powder data-active:[&_svg]:text-brand-plum dark:data-active:[&_svg]:text-brand-powder"
              >
                <Icon aria-hidden="true" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
