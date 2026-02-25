import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'

import './globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: {
    default: 'MAYA | Enterprise Deception Platform',
    template: '%s | MAYA'
  },
  description: 'Industrial-grade cybersecurity deception platform with autonomous honeypots, real-time threat detection, and CRDT synchronization for distributed security operations.',
  keywords: ['cybersecurity', 'deception', 'honeypot', 'threat detection', 'security', 'MITRE ATT&CK'],
  authors: [{ name: 'MAYA Security' }],
  openGraph: {
    title: 'MAYA | Enterprise Deception Platform',
    description: 'Deceive. Detect. Defend. Advanced cybersecurity deception technology.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#0c1222',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased min-h-screen bg-background" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}