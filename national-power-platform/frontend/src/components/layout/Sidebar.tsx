'use client';
import React from 'react';
import { User, RotateCcw, ShieldCheck, Lock } from 'lucide-react';
import { UserAccount } from '@/types/grid';

interface SidebarProps {
  navItems: { id: string; label: string; icon: any }[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onReset: () => void;
  loading: boolean;
  currentUser: UserAccount | null;
  onLoginClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  navItems,
  activeTab,
  setActiveTab,
  onReset,
  loading,
  currentUser,
  onLoginClick,
}) => (
  <aside className="hidden md:flex w-64 bg-[#500b50] text-white p-3 flex-col justify-between shrink-0 select-none shadow-md">
    <div className="space-y-4">
      {/* Dynamic Profile Box */}
      <div className="flex flex-col items-center pt-2 pb-3 border-b border-[#6f146f]/60 text-center">
        <div className="h-12 w-12 rounded-full bg-white/20 p-1 flex items-center justify-center border border-white/50 mb-1.5 shadow-inner">
          <User className="h-7 w-7 text-white" />
        </div>

        {currentUser ? (
          <>
            <span className="text-xs font-bold leading-tight truncate w-full px-2">
              {currentUser.name}
            </span>
            <span className="text-[10px] text-white/70 font-mono mt-0.5 truncate max-w-full px-2">
              {currentUser.institution}
            </span>
            <span className="mt-1.5 inline-block px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-600 text-white shadow-xs">
              {currentUser.role} (Active)
            </span>
          </>
        ) : (
          <>
            <span className="text-xs font-bold leading-tight text-white/90">
              Guest Researcher
            </span>
            <span className="text-[10px] text-white/60 font-mono mt-0.5">Read-Only Mode</span>
            <button
              onClick={onLoginClick}
              className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-200 border border-amber-300/30 hover:bg-amber-500/30 transition"
            >
              <Lock className="h-3 w-3" />
              <span>Login for Access</span>
            </button>
          </>
        )}
      </div>

      {/* Nav Menu */}
      <nav className="space-y-1">
        {navItems.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs transition ${
                isActive
                  ? 'bg-[#15803d] text-white font-bold shadow-xs'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>

    <div className="pt-3 border-t border-[#6f146f]/60">
      <button
        onClick={onReset}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 rounded bg-white/10 hover:bg-white/20 py-2 text-xs font-medium text-white transition disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5 text-emerald-300" />
        <span>Reset Grid Baseline</span>
      </button>
    </div>
  </aside>
);