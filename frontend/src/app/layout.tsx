import type { Metadata } from 'next';
import './globals.css';
import { SyncProvider } from '@/context/SyncContext';
import ClientLayout from './ClientLayout';

export const metadata: Metadata = {
  title: 'Velan Rice Mill - Billing & Cash Book',
  description: 'Offline-first Rice Mill Billing and Payment Sync Application',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SyncProvider>
          <ClientLayout>{children}</ClientLayout>
        </SyncProvider>
      </body>
    </html>
  );
}
