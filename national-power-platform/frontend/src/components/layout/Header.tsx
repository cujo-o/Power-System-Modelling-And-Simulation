'use client';

import React from 'react';
import { LogOut } from 'lucide-react';
import { PlatformUser } from './AppShell';

interface HeaderProps {
  user: PlatformUser;
  isAdmin?: boolean;
  modelName: string;
  converged: boolean;
  frequency: number;
  onLogout: () => void;
  onOpenCompanyPortal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLogout }) => {
  return (
    <header className="h-16 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <img
          src="/ml4ps-logo.png"
          alt="ML4PS"
          className="h-9 w-9 object-contain rounded-lg border border-slate-200 p-0.5 bg-white shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="truncate">
          <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate">
            National Power System Modelling and Simulation Platform (Nigeria)
          </h1>
          <p className="text-[11px] text-slate-500 truncate">
            Machine Learning 4 Power Systems (ML4PS) • FUT Minna
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/60 hover:bg-amber-100/80 px-3.5 py-1.5 text-xs font-bold text-amber-900 transition"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
};