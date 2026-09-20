'use client';
import React from 'react';
import { User, RotateCcw } from 'lucide-react';

interface SidebarProps {
  navItems: { id: string; label: string; icon: any }[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onReset: () => void;
  loading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  navItems,
  activeTab,
  setActiveTab,
  onReset,
  loading,
}) => (
  <aside className="hidden md:flex w-64 bg-[#500b50] text-white p-3 flex-col justify-between shrink-0 select-none shadow-md">
    <div className="space-y-4">
      <div className="flex flex-col items-center pt-2 pb-3 border-b border-[#6f146f]/60 text-center">
        <div className="h-12 w-12 rounded-full bg-white/20 p-1 flex items-center justify-center border border-white/50 mb-1.5">
          <User className="h-7 w-7 text-white" />
        </div>
        <span className="text-xs font-bold leading-tight truncate w-full px-2">
          Opeyemi Ibrahim Abubakar
        </span>
        <span className="text-[10px] text-white/70 font-mono">500L | ML4PS Researcher</span>
        <span className="mt-1.5 inline-block px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-600 text-white">
          Taskforce Administrator
        </span>
      </div>

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