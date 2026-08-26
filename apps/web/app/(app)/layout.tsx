import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { PageHeader } from "@/components/page-header"
import { isAuthenticated, preloadAuthQuery } from "@/lib/auth-server"
import { api } from "@workspace/backend/convex/_generated/api"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  if (!(await isAuthenticated())) {
    redirect("/login")
  }

  const preloadedUser = await preloadAuthQuery(api.auth.getCurrentUser)

  return (
    <SidebarProvider>
      <AppSidebar preloadedUser={preloadedUser} />
      <SidebarInset>
        <PageHeader />
        <div className="flex flex-1 flex-col p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
