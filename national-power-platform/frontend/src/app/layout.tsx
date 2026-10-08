import type { Metadata } from 'next';
import './globals.css';
import { GridProvider } from '@/context/GridContext';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'National Power System Simulation | ML4PS',
  description: 'Bulk electrical transmission simulation platform for NESI 330kV and sub-transmission networks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased overflow-hidden">
        <GridProvider>
          <AppShell>{children}</AppShell>
        </GridProvider>
      </body>
    </html>
  );
}