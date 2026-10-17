'use client';

import React from 'react';
import { LogOut, Globe } from 'lucide-react';
import { PlatformUser } from './AppShell';

interface HeaderProps {
  user: PlatformUser;
  isAdmin: boolean;
  modelName: string;
  converged: boolean;
  frequency: number;
  onLogout: () => void;
  onOpenCompanyPortal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onLogout,
  onOpenCompanyPortal,
}) => {
  return (
    <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <img
          src="/ml4ps-logo.png"
          alt="ML4PS"
          className="h-8 w-8 object-contain rounded-md border border-slate-200 p-0.5"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div>
          <h1 className="text-sm font-black text-slate-900 leading-tight">
            National Power System Simulation
          </h1>
          <p className="text-[11px] text-slate-500">
            Machine Learning 4 Power Systems (ML4PS) • FUT Minna
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenCompanyPortal}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition"
        >
          <Globe className="h-3.5 w-3.5 text-[#500b50]" />
          <span>Learning &amp; Company Portal</span>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 text-amber-900 text-xs font-bold transition"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
};