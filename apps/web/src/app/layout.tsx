import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SITE_URL } from '@/lib/queries';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Sports Hub — every match, live', template: '%s · Sports Hub' },
  description: 'Live scores, fixtures and results for company sports.',
  openGraph: { siteName: 'Sports Hub', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#0b0f14', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
