'use client';

import React from 'react';
import {
  TrendingUp,
  GitFork,
  Activity,
  DollarSign,
  FileText,
  UploadCloud,
} from 'lucide-react';

interface HomeTabProps {
  isAdmin?: boolean;
  onNavigate: (href: string) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ isAdmin = false, onNavigate }) => {
  const cards = [
    {
      title: 'Grid Stability Models',
      subtitle: 'AC power flow, governor droop, cascading outages, and expansion planning',
      icon: TrendingUp,
      href: '/stability',
      adminOnly: false,
    },
    {
      title: 'Single-Line Diagram',
      subtitle: 'Interactive busbar topology, live flows, and inline breaker switching',
      icon: GitFork,
      href: '/sld',
      adminOnly: false,
    },
    {
      title: 'Time-Domain Stability',
      subtitle: 'COI frequency response, 4-stage UFLS, and multi-machine CCT studies',
      icon: Activity,
      href: '/dynamics',
      adminOnly: false,
    },
    {
      title: 'Market Simulations',
      subtitle: 'Merit-order dispatch, SMP vs. pay-as-bid settlement, and load obligations',
      icon: DollarSign,
      href: '/market',
      adminOnly: false,
    },
    {
      title: 'Reports & Compliance',
      subtitle: 'Voltage envelope and thermal corridor audit against TCN Grid Code limits',
      icon: FileText,
      href: '/reports',
      adminOnly: false,
    },
    {
      title: 'Upload & Ingestion',
      subtitle: 'Parse and register MATPOWER (.m) or pandapower (.json) grid cases',
      icon: UploadCloud,
      href: '/upload',
      adminOnly: true,
    },
  ].filter((card) => !card.adminOnly || isAdmin);

  return (
    <div className="h-full flex items-center justify-center max-w-5xl mx-auto py-8">
      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.href}
              type="button"
              onClick={() => onNavigate(card.href)}
              className="group cursor-pointer rounded-xl border-2 border-slate-800 bg-white p-7 shadow-xs hover:shadow-xl hover:border-[#500b50] transition flex flex-col items-center text-center"
            >
              <div className="mb-4 flex h-13 w-13 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 group-hover:scale-105 transition shadow-inner">
                <Icon className="h-6 w-6 stroke-[2]" />
              </div>
              <h3 className="text-sm font-bold tracking-wider text-slate-900 uppercase group-hover:text-[#500b50] transition-colors">
                {card.title}
              </h3>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">{card.subtitle}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
