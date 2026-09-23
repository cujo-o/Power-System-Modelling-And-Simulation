'use client';

import React from 'react';
import { Menu, X, LogOut, LogIn } from 'lucide-react';
import { UserAccount } from '@/types/grid';

interface HeaderProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (val: boolean) => void;
  currentUser: UserAccount | null;
  onLoginClick: () => void;
  onLogoutClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mobileMenuOpen,
  setMobileMenuOpen,
  currentUser,
  onLoginClick,
  onLogoutClick,
}) => (
  <header className="flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 z-20 select-none shadow-xs">
    <div className="flex items-center gap-3">
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="flex h-8 w-8 items-center justify-center rounded bg-[#500b50] text-white hover:bg-[#680f68] transition shrink-0"
        aria-label="Toggle Navigation Menu"
      >
        {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Official ML4PS Crest & Title Block */}
      <div className="flex items-center gap-2.5">
        <img
          src="/ml4ps-logo.png"
          alt="ML4PS Logo"
          className="h-8 w-8 sm:h-9 sm:w-9 object-contain rounded-md bg-white p-0.5 border border-slate-200 shadow-xs shrink-0"
          onError={(e) => {
            // Graceful fallback if image has not been moved to /public yet
            e.currentTarget.style.display = 'none';
          }}
        />

        <div className="leading-tight">
          <h1 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#500b50]">
            National Power System Modelling & Simulation
          </h1>
          <p className="text-[10px] text-slate-500 font-medium">
            National Power System & Development Taskforce | Machine Learning 4 Power Systems (ML4PS)
          </p>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2.5">
      <span className="hidden sm:inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#f5eff6] text-[#500b50] border border-[#500b50]/20">
        ML4PS Lab
      </span>

      {currentUser ? (
        <div className="flex items-center gap-2">
          <div className="hidden md:flex flex-col text-right leading-none">
            <span className="text-xs font-bold text-slate-800">{currentUser.name}</span>
            <span className="text-[10px] text-emerald-700 font-medium mt-0.5">{currentUser.role}</span>
          </div>
          <button
            onClick={onLogoutClick}
            className="flex items-center gap-1 rounded bg-[#ffefe5] px-3 py-1 text-xs font-semibold text-[#c2410c] border border-[#ffedd5] hover:bg-[#fed7aa] transition shadow-xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Log out</span>
          </button>
        </div>
      ) : (
        <button
          onClick={onLoginClick}
          className="flex items-center gap-1.5 rounded bg-[#500b50] text-white px-3.5 py-1 text-xs font-bold hover:bg-[#680f68] transition shadow-xs"
        >
          <LogIn className="h-3.5 w-3.5" />
          <span>Login / Register</span>
        </button>
      )}
    </div>
  </header>
);