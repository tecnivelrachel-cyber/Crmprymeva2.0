import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'TecNível Orçamentos', template: '%s | TecNível Orçamentos' },
  description: 'Orçamentos comerciais rápidos da TecNível.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Orçamentos', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#0b63ce',
  width: 'device-width',
  initialScale: 1,
  // Impede o zoom automático do iOS ao focar um campo, sem travar o pinch.
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
