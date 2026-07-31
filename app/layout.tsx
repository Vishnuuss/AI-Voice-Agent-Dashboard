import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Bodoni_Moda, Geist_Mono, Outfit } from "next/font/google"
import "./globals.css"

/**
 * Three faces, each with one job.
 *
 * Bodoni Moda is a Didone — the same high-contrast, hairline-serif family the
 * BS Wealth wordmark is drawn in — so the display type and the logo speak the
 * same language. Reserved for the wordmark and page titles only.
 *
 * Outfit carries the interface: geometric, quiet, and legible down to 12px,
 * which a Didone is not. Geist Mono handles figures in tables so digits stay
 * on their columns as live values tick.
 */
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-bodoni",
  display: "swap",
})
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
})
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" })

export const metadata: Metadata = {
  title: "BS Wealth | Loan Lead Operations",
  description: "Real-time visibility into AI loan-lead qualification, calls, follow-ups, and campaign performance.",
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#22201d" },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body
        className={`${outfit.variable} ${bodoni.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
