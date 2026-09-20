'use client';
import React from 'react';
import { Menu, X, LogOut, LogIn } from 'lucide-react';

interface HeaderProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (val: boolean) => void;
  userEmail?: string;
  onLoginClick: () => void;
  onLogoutClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mobileMenuOpen,
  setMobileMenuOpen,
  userEmail,
  onLoginClick,
  onLogoutClick,
}) => (
  <header className="flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 z-20 select-none shadow-xs">
    <div className="flex items-center gap-3">
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="flex h-8 w-8 items-center justify-center rounded bg-[#500b50] text-white hover:bg-[#680f68] transition"
      >
        {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      <div>
        <h1 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#500b50]">
          National Power System Modelling & Simulation
        </h1>
        <p className="text-[10px] text-slate-500 font-medium">
          National Power System & Development Taskforce | Machine Learning 4 Power Systems (ML4PS)
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <span className="hidden sm:inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#f5eff6] text-[#500b50] border border-[#500b50]/20">
        ML4PS Lab
      </span>
      {userEmail ? (
        <button
          onClick={onLogoutClick}
          className="flex items-center gap-1 rounded bg-[#ffefe5] px-3 py-1 text-xs font-semibold text-[#c2410c] border border-[#ffedd5]"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </button>
      ) : (
        <button
          onClick={onLoginClick}
          className="flex items-center gap-1 rounded bg-[#f1f5f9] px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-200"
        >
          <LogIn className="h-3.5 w-3.5 text-[#500b50]" />
          <span>Login</span>
        </button>
      )}
    </div>
  </header>
);