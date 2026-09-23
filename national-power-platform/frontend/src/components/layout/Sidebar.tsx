'use client';

import React from 'react';
import { UserAccount } from '@/types/grid';
import { RotateCcw, User, LucideIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  navItems: NavItem[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onReset: () => void;
  loading: boolean;
  currentUser: UserAccount | null;
  onLoginClick: () => void;
  desktopCollapsed: boolean;
  setDesktopCollapsed: (val: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (val: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  navItems,
  activeTab,
  setActiveTab,
  onReset,
  loading,
  currentUser,
  desktopCollapsed,
  setDesktopCollapsed,
  mobileMenuOpen,
  setMobileMenuOpen,
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col justify-between bg-[#460946] text-white transition-all duration-300 ease-in-out shadow-xl md:shadow-none select-none h-screen ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${desktopCollapsed ? 'md:w-20' : 'md:w-64'}`}
      >
        {/* Top: Header, User Profile & Sidebar Collapse Button */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-3.5 border-b border-white/10 flex items-center justify-between gap-2">
            {desktopCollapsed ? (
              <div className="w-full flex flex-col items-center gap-2">
                <div
                  className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white"
                  title={currentUser?.name || 'Operator'}
                >
                  <User className="h-5 w-5" />
                </div>
                {/* Expand Button on Collapsed Rail */}
                <button
                  onClick={() => setDesktopCollapsed(false)}
                  className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
                  title="Expand Sidebar"
                  aria-label="Expand Sidebar"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-10 w-10 rounded-full bg-white/15 flex items-center justify-center text-white shrink-0">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-white truncate leading-snug">
                      {currentUser?.name || 'Authorized Operator'}
                    </h3>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Active Session
                    </span>
                  </div>
                </div>

                {/* Collapse Button inside Expanded Sidebar */}
                <button
                  onClick={() => setDesktopCollapsed(true)}
                  className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition shrink-0"
                  title="Collapse Sidebar"
                  aria-label="Collapse Sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Navigation Links with Sleek Matching Scrollbar */}
          <nav
            className="flex-1 p-3 space-y-1.5 overflow-y-auto pr-1.5 
            [scrollbar-width:thin] 
            [scrollbar-color:rgba(255,255,255,0.2)_transparent] 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-white/20 
            hover:[&::-webkit-scrollbar-thumb]:bg-white/35 
            [&::-webkit-scrollbar-thumb]:rounded-full"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  title={desktopCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-bold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  } ${desktopCollapsed ? 'justify-center px-0' : ''}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!desktopCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Reset Action Button */}
        <div className="p-3 border-t border-white/10 shrink-0">
          <button
            onClick={onReset}
            disabled={loading}
            title={desktopCollapsed ? 'Reset Grid Baseline' : undefined}
            className={`w-full flex items-center gap-2 rounded-xl bg-white/10 py-2.5 px-3 text-xs font-bold text-white hover:bg-white/20 transition disabled:opacity-50 ${
              desktopCollapsed ? 'justify-center px-0' : 'justify-center'
            }`}
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            {!desktopCollapsed && <span>Reset Baseline</span>}
          </button>
        </div>
      </aside>
    </>
  );
};