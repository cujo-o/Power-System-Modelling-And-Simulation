'use client';

import React from 'react';
import { UserAccount } from '@/types/grid';
import { RotateCcw, User, LucideIcon } from 'lucide-react';

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
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col justify-between bg-[#460946] text-white transition-all duration-300 ease-in-out shadow-xl md:shadow-none select-none ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${desktopCollapsed ? 'md:w-20' : 'md:w-64'}`}
      >
        {/* Top: User Profile Badge */}
        <div>
          <div className={`p-4 border-b border-white/10 ${desktopCollapsed ? 'flex justify-center' : ''}`}>
            {desktopCollapsed ? (
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white" title={currentUser?.name || 'Operator'}>
                <User className="h-5 w-5" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-white/15 flex items-center justify-center text-white shrink-0">
                  <User className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-white truncate leading-snug">
                    {currentUser?.name || 'Authorized Operator'}
                  </h3>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    Active Session
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1.5 overflow-y-auto max-h-[calc(100vh-210px)]">
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
        <div className="p-3 border-t border-white/10">
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