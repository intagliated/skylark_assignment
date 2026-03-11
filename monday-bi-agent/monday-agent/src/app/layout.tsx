import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Monday BI Agent',
  description: 'AI-powered business intelligence for Monday.com',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
