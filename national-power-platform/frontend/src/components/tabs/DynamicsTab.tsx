'use client';
import React from 'react';
import { DynamicSimResult } from '@/types/grid';
import { Play, RefreshCw } from 'lucide-react';

interface DynamicsTabProps {
  dynDisturbance: number;
  setDynDisturbance: (v: number) => void;
  enableGovernor: boolean;
  setEnableGovernor: (v: boolean) => void;
  enablePSS: boolean;
  setEnablePSS: (v: boolean) => void;
  runDynamicSimulation: () => void;
  dynLoading: boolean;
  dynResult: DynamicSimResult | null;
}

export const DynamicsTab: React.FC<DynamicsTabProps> = ({
  dynDisturbance,
  setDynDisturbance,
  enableGovernor,
  setEnableGovernor,
  enablePSS,
  setEnablePSS,
  runDynamicSimulation,
  dynLoading,
  dynResult,
}) => (
  <div className="space-y-6 max-w-6xl mx-auto">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-[#500b50]">Time-Domain Dynamics & PSS Analysis</h2>
        <p className="text-xs text-slate-500">
          Numerical swing equation integration, turbine governor droop, and Power System Stabilizer (PSS) damping.
        </p>
      </div>

      <button
        onClick={runDynamicSimulation}
        disabled={dynLoading}
        className="flex items-center gap-1.5 rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white shadow-xs disabled:opacity-50"
      >
        {dynLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        <span>Simulate Transient Response</span>
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="p-4 rounded-lg border border-slate-200 bg-white">
        <span className="text-xs font-bold text-slate-700">Trip Disturbance Size</span>
        <div className="flex items-center justify-between mt-2">
          <input
            type="range"
            min="100"
            max="1200"
            step="50"
            value={dynDisturbance}
            onChange={(e) => setDynDisturbance(parseFloat(e.target.value))}
            className="w-2/3 accent-[#500b50]"
          />
          <span className="font-mono font-bold text-xs text-[#500b50]">{dynDisturbance} MW</span>
        </div>
        <span className="text-[10px] text-slate-400 block mt-1">Simulates trip of Egbin (1,080 MW) or Kainji</span>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-700 block">Turbine Governor Droop (R = 5%)</span>
          <span className="text-[10px] text-slate-400">Primary frequency containment action</span>
        </div>
        <input
          type="checkbox"
          checked={enableGovernor}
          onChange={(e) => setEnableGovernor(e.target.checked)}
          className="h-5 w-5 accent-[#500b50] cursor-pointer"
        />
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-700 block">Power System Stabilizer (PSS)</span>
          <span className="text-[10px] text-slate-400">Damps rotor oscillation modes</span>
        </div>
        <input
          type="checkbox"
          checked={enablePSS}
          onChange={(e) => setEnablePSS(e.target.checked)}
          className="h-5 w-5 accent-[#500b50] cursor-pointer"
        />
      </div>
    </div>

    {/* Trajectory Plot Canvas */}
    <div className="rounded-lg border border-slate-800 bg-[#0c1427] p-5 shadow-md text-white">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          System Frequency Trajectory: f(t) [50.00 Hz Base]
        </span>
        <div className="flex gap-4 text-xs font-mono">
          <span>Nadir: <strong className="text-rose-400">{dynResult?.metrics.nadir_hz.toFixed(2)} Hz</strong></span>
          <span>Initial RoCoF: <strong className="text-amber-400">{dynResult?.metrics.initial_rocof_hz_per_s.toFixed(2)} Hz/s</strong></span>
          <span>Settling: <strong className="text-cyan-400">{dynResult?.metrics.settling_hz.toFixed(2)} Hz</strong></span>
        </div>
      </div>

      <svg viewBox="0 0 600 200" className="w-full h-56 select-none">
        <line x1="40" y1="30" x2="580" y2="30" stroke="#1e293b" strokeDasharray="3 3" />
        <line x1="40" y1="100" x2="580" y2="100" stroke="#334155" strokeWidth="1" />
        <line x1="40" y1="170" x2="580" y2="170" stroke="#1e293b" strokeDasharray="3 3" />

        <text x="5" y="35" fill="#64748b" fontSize="9" fontFamily="monospace">50.5Hz</text>
        <text x="5" y="105" fill="#94a3b8" fontSize="9" fontFamily="monospace">50.0Hz</text>
        <text x="5" y="175" fill="#64748b" fontSize="9" fontFamily="monospace">49.0Hz</text>

        <line x1="40" y1="185" x2="580" y2="185" stroke="#e11d48" strokeDasharray="4 4" strokeWidth="1.5" />
        <text x="440" y="180" fill="#f43f5e" fontSize="8" fontFamily="monospace">NERC UFLS Stage 1: 48.80 Hz</text>

        {dynResult && (
          <polyline
            fill="none"
            stroke={dynResult.metrics.ufls_triggered ? '#f43f5e' : '#10b981'}
            strokeWidth="2.5"
            points={dynResult.time
              .map((t, idx) => {
                const x = 40 + (t / 15.0) * 540;
                const freq = dynResult.frequency[idx];
                const y = 100 - (freq - 50.0) * 70;
                return `${x},${Math.max(20, Math.min(195, y))}`;
              })
              .join(' ')}
          />
        )}
      </svg>
    </div>
  </div>
);