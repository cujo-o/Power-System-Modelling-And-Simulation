import type { Metadata } from 'next';
import './globals.css';
import { GridProvider } from '@/context/GridContext';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'National Power System Simulation Platform | ML4PS FUT Minna',
  description:
    'Power system modelling, stability analysis, and electricity market simulation for the Nigerian National Grid.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">
        <GridProvider>
          <AppShell>{children}</AppShell>
        </GridProvider>
      </body>
    </html>
  );
}