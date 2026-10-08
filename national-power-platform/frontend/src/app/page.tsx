'use client';

import React from 'react';
import { useGrid } from '@/context/GridContext';
import {
  Zap,
  Activity,
  AlertTriangle,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { activeModel, buses, lines, trippedLines, loading, runSimulation } = useGrid();

  const totalGen = buses.reduce((acc, b) => (b.p_mw && b.p_mw < 0 ? acc + Math.abs(b.p_mw) : acc), 0);
  const totalLoad = buses.reduce((acc, b) => (b.p_mw && b.p_mw > 0 ? acc + b.p_mw : acc), 0);
  const overloadedLines = lines.filter((l) => (l.loading_percent ?? 0) > 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            National Grid Operations Cockpit
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time bulk telemetry dispatch, active reserve capacity, and security margins.
          </p>
        </div>

        <button
          onClick={() => runSimulation()}
          disabled={loading || !activeModel}
          className="flex items-center gap-2 rounded-xl bg-[#500b50] px-4 py-2 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
        >
          <Activity className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh AC Flow State</span>
        </button>
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Generation</span>
            <Zap className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {totalGen.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Case: {activeModel?.name || 'None Active'}
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Grid Demand</span>
            <Cpu className="h-4 w-4 text-purple-700" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {totalLoad.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Synchronous load centers
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Corridor Security</span>
            <AlertTriangle className={`h-4 w-4 ${overloadedLines.length > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {overloadedLines.length} <span className="text-sm font-normal text-slate-400">Overloads</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {trippedLines.length} breaker(s) opened ($N-1$)
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Grid Frequency</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-700">
            50.00 <span className="text-sm font-normal text-slate-400">Hz</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Target statutory deadband: 49.75–50.25 Hz
          </span>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          href="/stability"
          className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs hover:border-[#500b50] transition group flex flex-col justify-between"
        >
          <div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-[#500b50] flex items-center justify-center mb-3">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm group-hover:text-[#500b50] transition">
              Grid Stability &amp; Load Sharing
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Adjust demand scaling, activate models, calculate autonomous governor droop pickup, and run $N-1$ breakers.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-bold text-[#500b50]">
            <span>Open Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </Link>

        <Link
          href="/sld"
          className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs hover:border-[#500b50] transition group flex flex-col justify-between"
        >
          <div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-[#500b50] flex items-center justify-center mb-3">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm group-hover:text-[#500b50] transition">
              Single-Line Schematic CAD
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Draggable, vector Single-Line Diagram with physical colliders, clean CAD white styling, and live property inspection.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-bold text-[#500b50]">
            <span>View Network</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </Link>

        <Link
          href="/upload"
          className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs hover:border-[#500b50] transition group flex flex-col justify-between"
        >
          <div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-[#500b50] flex items-center justify-center mb-3">
              <Activity className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm group-hover:text-[#500b50] transition">
              Upload &amp; Model Ingestion
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Ingest raw MATPOWER (.m), .130, .raw, and spreadsheet models with instant topological health checks.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-bold text-[#500b50]">
            <span>Ingest Files</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </Link>
      </div>
    </div>
  );
}