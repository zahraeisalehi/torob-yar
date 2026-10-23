import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ترب‌یار — دستیار خرید حضوری',
  description: 'بگو چی میخوای بخری تا با هم مدل‌ها، قیمت‌ها و نزدیک‌ترین فروشگاه رو پیدا کنیم.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body className="h-full min-h-dvh bg-canvas text-ink">{children}</body>
    </html>
  );
}
