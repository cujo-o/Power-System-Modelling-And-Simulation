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
  <header className="flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white px-4 md:px-6 z-30 select-none shadow-xs shrink-0">
    <div className="flex items-center gap-3">
      {/* Mobile Drawer Toggle (Shown only on small screens) */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="flex md:hidden h-9 w-9 items-center justify-center rounded-lg bg-[#500b50] text-white hover:bg-[#680f68] transition"
        aria-label="Toggle Navigation Menu"
      >
        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Brand & Crest */}
      <div className="flex items-center gap-3">
        <img
          src="/ml4ps-logo.png"
          alt="ML4PS Crest"
          className="h-9 w-9 object-contain rounded-md bg-white p-0.5 border border-slate-200 shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />

        <div className="leading-tight">
          <h1 className="text-sm md:text-base font-black tracking-tight text-[#500b50]">
            National Power System Simulation
          </h1>
          <p className="text-xs text-slate-500 font-medium hidden sm:block">
            Machine Learning 4 Power Systems (ML4PS) • FUT Minna
          </p>
        </div>
      </div>
    </div>

    {/* User Status & Auth */}
    <div className="flex items-center gap-3">
      <span className="hidden lg:inline-flex px-3 py-1 rounded-full text-xs font-bold bg-[#f5eff6] text-[#500b50] border border-[#500b50]/20">
        NESI 330/132 kV Grid
      </span>

      {currentUser ? (
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right leading-tight">
            <span className="text-sm font-bold text-slate-900">{currentUser.name}</span>
            <span className="text-xs text-emerald-700 font-semibold">{currentUser.role}</span>
          </div>
          <button
            onClick={onLogoutClick}
            className="flex items-center gap-1.5 rounded-lg bg-orange-50 px-3.5 py-1.5 text-xs font-bold text-orange-700 border border-orange-200 hover:bg-orange-100 transition shadow-xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Log out</span>
          </button>
        </div>
      ) : (
        <button
          onClick={onLoginClick}
          className="flex items-center gap-2 rounded-lg bg-[#500b50] text-white px-4 py-2 text-xs font-bold hover:bg-[#680f68] transition shadow-xs"
        >
          <LogIn className="h-4 w-4" />
          <span>Operator Sign In</span>
        </button>
      )}
    </div>
  </header>
);