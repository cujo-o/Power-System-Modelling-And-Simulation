'use client';

import React from 'react';
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
  Globe,
} from 'lucide-react';
import { PlatformUser } from './AppShell';

interface SidebarProps {
  user: PlatformUser;
  isAdmin: boolean;
  onOpenCompanyPortal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, isAdmin, onOpenCompanyPortal }) => {
  const pathname = usePathname();

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard, adminOnly: false },
    { label: 'Grid Stability Models', href: '/stability', icon: Sliders, adminOnly: false },
    { label: 'Single-Line Diagram', href: '/sld', icon: GitFork, adminOnly: false },
    { label: 'Time-Domain', href: '/dynamics', icon: Activity, adminOnly: false },
    { label: 'Market (ASSUME)', href: '/market', icon: DollarSign, adminOnly: false },
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
    <aside className="w-60 bg-[#3b073b] text-white flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* User Profile Header */}
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center font-bold text-xs shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{user.name}</p>
            <span
              className={`inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] font-bold ${
                isAdmin ? 'bg-emerald-500 text-white' : 'bg-white/15 text-white/80'
              }`}
            >
              {isAdmin ? 'Admin' : 'Researcher / User'}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-2.5 space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
        </nav>
      </div>

      {/* Switch to Public Company & Learning Site */}
      <div className="p-3 border-t border-white/10 space-y-2">
        <button
          onClick={onOpenCompanyPortal}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition"
        >
          <Globe className="h-3.5 w-3.5" />
          <span>Company &amp; Learning Site</span>
        </button>
        <p className="text-[10px] text-white/50 text-center leading-snug">
          ML4PS • FUT Minna
        </p>
      </div>
    </aside>
  );
};