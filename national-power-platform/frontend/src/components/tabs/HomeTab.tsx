'use client';
import React from 'react';
import { TrendingUp, DollarSign, UploadCloud, BarChart3 } from 'lucide-react';

interface HomeTabProps {
  onNavigate: (tab: string) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ onNavigate }) => {
  const cards = [
    {
      title: 'Grid Stability Models',
      icon: TrendingUp,
      tab: 'Grid Models',
    },
    {
      title: 'Market Simulation Models',
      icon: DollarSign,
      tab: 'Market Simulations',
    },
    {
      title: 'Data Upload & Ingestion',
      icon: UploadCloud,
      tab: 'Data Upload',
    },
    {
      title: 'Reports & Visualization',
      icon: BarChart3,
      tab: 'Visualization',
    },
  ];

  return (
    <div className="h-full flex items-center justify-center max-w-4xl mx-auto py-10">
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={() => onNavigate(card.tab)}
              className="group cursor-pointer rounded-xl border-2 border-slate-800 bg-white p-8 shadow-xs hover:shadow-xl hover:border-[#500b50] transition flex flex-col items-center text-center"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 group-hover:scale-110 transition shadow-inner">
                <Icon className="h-7 w-7 stroke-[2]" />
              </div>
              <h3 className="text-sm font-bold tracking-wider text-slate-900 uppercase group-hover:text-[#500b50] transition-colors">
                {card.title}
              </h3>
              
            </div>
          );
        })}
      </div>
    </div>
  );
  
};