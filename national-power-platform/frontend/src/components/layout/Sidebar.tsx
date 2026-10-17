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
  GitFork,
  FileText,
  Users,
  Info,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PlatformUser } from './AppShell';

interface SidebarProps {
  user: PlatformUser;
  isAdmin: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, isAdmin }) => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard, adminOnly: false },
    { label: 'Grid Stability Models', href: '/stability', icon: Sliders, adminOnly: false },
    { label: 'Single-Line Diagram', href: '/sld', icon: GitFork, adminOnly: false },
    { label: 'Time-Domain', href: '/dynamics', icon: Activity, adminOnly: false },
    { label: 'Market Simulations', href: '/market', icon: DollarSign, adminOnly: false },
    { label: 'Upload & Ingestion', href: '/upload', icon: UploadCloud, adminOnly: true },
    { label: 'Access & Admin', href: '/organization', icon: ShieldCheck, adminOnly: true },
    { label: 'Reports & Publications', href: '/reports', icon: FileText, adminOnly: false },
    { label: 'Workforce', href: '/workforce', icon: Users, adminOnly: false },
    { label: 'About Us', href: '/about', icon: Info, adminOnly: false },
  ];

  const initials = (user.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-60'
      } bg-[#3b073b] text-white flex flex-col justify-between shrink-0 select-none transition-all duration-200`}
    >
      <div className="overflow-y-auto">
        {/* User Profile Header + Collapse Button */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center font-bold text-xs shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{user.name}</p>
                <span
                  className={`inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] font-bold ${
                    isAdmin ? 'bg-emerald-500 text-white' : 'bg-white/15 text-white/80'
                  }`}
                >
                  {isAdmin ? 'Admin' : 'Researcher'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition shrink-0"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="p-2 space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center ${
                    collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
                  } py-2 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
        </nav>
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-white/10">
          <p className="text-[10px] text-white/50 text-center leading-snug">
            Copyright 2026 National Power System Modelling &amp; Simulation Platform • ML4PS FUT Minna
          </p>
        </div>
      )}
    </aside>
  );
};