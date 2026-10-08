'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  ChevronLeft,
  ChevronRight,
  LogOut,
  Zap,
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

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Sidebar Shell */}
      <aside
        className={`${
          collapsed ? 'w-18' : 'w-64'
        } bg-[#500b50] text-white flex flex-col shrink-0 transition-all duration-200 select-none z-30 shadow-xl`}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-bold text-sm shrink-0">
              OA
            </div>
            {!collapsed && (
              <div className="truncate">
                <span className="text-xs font-bold block truncate">Opeyemi Ibrahim Abubakar</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-700 font-mono font-semibold inline-block">
                  Admin
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition shrink-0 ml-1"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="p-2.5 space-y-1 flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="p-3 border-t border-white/10 text-[10px] font-mono text-white/50 text-center">
            Copyright 2026 National Power System Modelling & Simulation Platform | Machine Learning 4 Power Systems (ML4PS) | FUT Minna
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* ML4PS Official Icon Badge */}
            <div className="h-8 w-8 rounded-lg border border-purple-200 bg-purple-50 flex items-center justify-center shrink-0 shadow-2xs">
              <img
                src="/ml4ps-logo.png"
                alt="ML4PS Crest"
                className="h-9 w-9 object-contain rounded-md bg-white p-0.5 border border-slate-200 shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <div>
              <span className="font-black text-sm text-slate-900 tracking-tight block leading-none">
                National Power System Simulation
              </span>
              <span className="text-[10px] text-slate-500 font-medium mt-1 block leading-none">
                Machine Learning 4 Power Systems (ML4PS) • FUT Minna
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => alert('Session active.')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50/50 hover:bg-orange-100/70 text-orange-700 text-xs font-bold transition shadow-2xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50">{children}</main>
      </div>
    </div>
  );
};