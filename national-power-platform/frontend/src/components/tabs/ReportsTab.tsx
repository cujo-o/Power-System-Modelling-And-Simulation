'use client';
import React from 'react';
import { SimResult } from '@/types/grid';
import { FileText, BarChart3 } from 'lucide-react';

interface ReportsTabProps {
  results: SimResult | null;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ results }) => (
  <div className="space-y-6 max-w-6xl mx-auto">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-[#500b50]">National Grid Contingency Audit Report</h2>
        <p className="text-xs text-slate-500">Grid Code compliance audit against statutory boundaries (0.95 ≤ |V| ≤ 1.05 p.u., loading ≤ 85%).</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded bg-[#500b50] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Print / Save PDF</span>
        </button>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
        <span className="text-slate-400 block mb-1">Total System Infeed</span>
        <span className="text-xl font-mono font-bold text-[#500b50]">
          {results?.total_gen_mw ? `${results.total_gen_mw.toLocaleString()} MW` : '--'}
        </span>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
        <span className="text-slate-400 block mb-1">Total System Losses</span>
        <span className="text-xl font-mono font-bold text-rose-600">
          {results?.total_losses_mw ? `${results.total_losses_mw} MW` : '--'}
        </span>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
        <span className="text-slate-400 block mb-1">Voltage Violations</span>
        <span className="text-xl font-mono font-bold text-amber-600">
          {results?.buses ? results.buses.filter((b) => b.v_pu < 0.95 || b.v_pu > 1.05).length : 0} Nodes
        </span>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
        <span className="text-slate-400 block mb-1">Critical Lines (&gt;80%)</span>
        <span className="text-xl font-mono font-bold text-emerald-700">
          {results?.lines ? results.lines.filter((l) => l.loading_percent > 80).length : 0} Corridors
        </span>
      </div>
    </div>
  </div>
);