import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { SITE_URL } from '@/lib/queries';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Sports Hub — every match, live', template: '%s · Sports Hub' },
  description: 'Live scores, fixtures and results for company sports.',
  openGraph: { siteName: 'Sports Hub', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#0d0e11', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (ColorZilla, password managers, translators) add attributes to <html> and <body>
    // before React loads. suppressHydrationWarning covers just these two elements, not their children.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
