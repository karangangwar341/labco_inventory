import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Labco Instruments - AI Warehouse & Operations',
  description: 'Enterprise ACID warehouse, manufacturing, and AI inventory ledger platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-slate-50 text-slate-900 antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
