'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GridProvider } from '@/context/GridContext';
import {
  LayoutDashboard,
  Sliders,
  Activity,
  DollarSign,
  UploadCloud,
  Share2,
  FileText,
  Users,
  Info,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stability', label: 'Grid Stability Models', icon: Sliders },
  { href: '/dynamics', label: 'Time-Domain', icon: Activity },
  { href: '/market', label: 'Market Simulations', icon: DollarSign },
  { href: '/upload', label: 'Upload & Ingestion', icon: UploadCloud },
  { href: '/sld', label: 'Single-Line Diagram', icon: Share2 },
  { href: '/reports', label: 'Reports & Publications', icon: FileText },
  { href: '/workforce', label: 'Workforce', icon: Users },
  { href: '/about', label: 'About Us', icon: Info },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <body className="flex h-screen bg-slate-50 overflow-hidden font-sans">
        <GridProvider>
          {/* Persistent Sidebar Shell */}
          <aside className="w-64 bg-[#500b50] text-white flex flex-col shrink-0">
            <div className="p-5 border-b border-white/10 font-black tracking-tight text-lg">
              ML4PS Platform
            </div>
            <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main Content Viewport */}
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </GridProvider>
      </body>
    </html>
  );
}