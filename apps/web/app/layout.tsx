import { DM_Sans, Geist_Mono, Playfair_Display } from "next/font/google"
import type { Metadata, Viewport } from "next"

import "@workspace/ui/globals.css"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { getToken } from "@/lib/auth-server"
import { cn } from "@workspace/ui/lib/utils"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
})

const fontDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  display: "swap",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim()
  const value = configuredUrl || vercelHost || "http://localhost:3000"

  return new URL(
    value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`
  )
}

const siteUrl = getSiteUrl()

const siteDescription =
  "Plan, share, and coordinate event looks with Aso Circle."

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Aso Circle",
    template: "%s | Aso Circle",
  },
  description: siteDescription,
  applicationName: "Aso Circle",
  authors: [{ name: "Aso Circle" }],
  creator: "Aso Circle",
  publisher: "Aso Circle",
  category: "event planning",
  keywords: [
    "aso ebi",
    "event planning",
    "wedding coordination",
    "birthday planning",
    "event ordering",
  ],
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Aso Circle",
    title: "Aso Circle",
    description: siteDescription,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Aso Circle — Your people. Your style.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aso Circle",
    description: siteDescription,
    images: ["/twitter-image.png"],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  appleWebApp: {
    capable: true,
    title: "Aso Circle",
    statusBarStyle: "black-translucent",
  },
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#F5F5F7",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const initialToken = await getToken()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontDisplay.variable,
        fontMono.variable,
        "font-sans",
        fontSans.variable
      )}
    >
      <body>
        <ConvexClientProvider initialToken={initialToken}>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  )
}
