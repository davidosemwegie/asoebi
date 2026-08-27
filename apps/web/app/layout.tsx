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

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
)

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
  alternates: {
    canonical: "/",
  },
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
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
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F0E8" },
    { media: "(prefers-color-scheme: dark)", color: "#180D14" },
  ],
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
