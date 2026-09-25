import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';

import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { APP_DESCRIPTION, APP_NAME, APP_URL } from '@/config/constants';
import { cn } from '@/lib/utils';

import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

// Monospace face for addresses, balances, and percentages so digits stay aligned.
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: [{ url: '/preview.png', width: 1200, height: 630, alt: APP_NAME }]
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ['/preview.png']
  },
  icons: {
    icon: '/favicon.svg'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(inter.variable, jetBrainsMono.variable)}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
        <Toaster position="bottom-right" theme="system" closeButton />
      </body>
    </html>
  );
}
