'use client';
import React from 'react';
import { BusData, LineData } from '@/types/grid';
import { AlertTriangle, CheckCircle2, Play, RefreshCw, RotateCcw, Sliders } from 'lucide-react';

interface Props {
  modelName: string;
  divergedNotice: string | null;
  loadMultiplier: number;
  setLoadMultiplier: (v: number) => void;
  runSimulation: () => void;
  onReset: () => void;
  loading: boolean;
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  toggleLine: (id: number) => void;
}

export const GridStabilityTab: React.FC<Props> = ({
  modelName,
  divergedNotice,
  loadMultiplier,
  setLoadMultiplier,
  runSimulation,
  onReset,
  loading,
  buses,
  lines,
  trippedLines,
  toggleLine,
}) => (
  <div className="space-y-6 max-w-6xl mx-auto">
    {divergedNotice && (
      <div className="flex items-center gap-2 rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
        <span>{divergedNotice}</span>
      </div>
    )}

    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-[#500b50]">Steady-State AC Power Flow & Contingency</h2>
        <p className="text-xs text-slate-500">
          Active Network: <span className="font-bold text-slate-900">{modelName}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-slate-300 text-xs shadow-2xs">
          <Sliders className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-slate-600">Demand:</span>
          <input
            type="range"
            min="0.7"
            max="1.4"
            step="0.05"
            value={loadMultiplier}
            onChange={(e) => setLoadMultiplier(parseFloat(e.target.value))}
            className="w-16 sm:w-20 accent-[#500b50] cursor-pointer"
          />
          <span className="font-mono font-bold text-[#500b50]">{(loadMultiplier * 100).toFixed(0)}%</span>
        </div>

        <button
          onClick={runSimulation}
          disabled={loading}
          className="flex items-center gap-1.5 rounded bg-[#500b50] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs disabled:opacity-50"
        >
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          <span>Solve AC Flow</span>
        </button>

        <button
          onClick={onReset}
          disabled={loading}
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
        >
          <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
          <span>Reset</span>
        </button>
      </div>
    </div>

    {/* Substation Bus Voltage Profiles Table */}
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
      <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
        <span>Substation Bus Voltage Profiles</span>
        <span className="font-normal text-[11px] text-white/80">Statutory NERC Band: 0.95 – 1.05 p.u.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[550px]">
          <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold">
            <tr>
              <th className="p-2.5">ID</th>
              <th className="p-2.5">Substation Name</th>
              <th className="p-2.5">Regional Zone</th>
              <th className="p-2.5">Voltage (|V|)</th>
              <th className="p-2.5">Angle (°)</th>
              <th className="p-2.5">Active (MW)</th>
              <th className="p-2.5">Reactive (MVAR)</th>
              <th className="p-2.5">Compliance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {buses.map((bus) => {
              const isUnder = bus.v_pu < 0.95;
              const isOver = bus.v_pu > 1.05;
              return (
                <tr key={bus.id} className="hover:bg-[#fcfaff]">
                  <td className="p-2.5 font-mono text-slate-400 font-bold">#{bus.id}</td>
                  <td className="p-2.5 font-bold text-slate-900">{bus.name}</td>
                  <td className="p-2.5 text-slate-500">{bus.zone}</td>
                  <td className="p-2.5 font-mono font-bold">
                    <span className={isUnder ? 'text-rose-600' : isOver ? 'text-amber-600' : 'text-emerald-700'}>
                      {bus.v_pu.toFixed(3)} pu
                    </span>
                  </td>
                  <td className="p-2.5 font-mono">{bus.va_deg.toFixed(2)}°</td>
                  <td className="p-2.5 font-mono">{bus.p_mw}</td>
                  <td className="p-2.5 font-mono">{bus.q_mvar}</td>
                  <td className="p-2.5">
                    {isUnder ? (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        Low (Under-voltage)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Compliant
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    {/* N-1 Line Breaker Controls */}
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
      <h3 className="text-sm font-bold text-[#500b50] mb-1">N-1 Line Contingency & Breaker Controls</h3>
      <p className="text-xs text-slate-500 mb-4">Click "Trip Breaker" to isolate a corridor and observe power redistribution.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {lines.map((line) => {
          const isTripped = trippedLines.includes(line.id);
          return (
            <div
              key={line.id}
              className={`rounded border p-3 flex flex-col justify-between transition ${
                isTripped
                  ? 'border-rose-300 bg-rose-50/50'
                  : line.loading_percent > 85
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800 truncate">{line.name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  !isTripped ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                }`}>
                  {!isTripped ? 'Online' : 'Tripped'}
                </span>
              </div>

              <div className="space-y-1 font-mono text-[11px] text-slate-600 mb-3">
                <div className="flex justify-between">
                  <span>Active Flow:</span>
                  <span className="text-slate-900 font-bold">{line.flow_mw} MW</span>
                </div>
                <div className="flex justify-between">
                  <span>Loading:</span>
                  <span className={line.loading_percent > 85 ? 'text-amber-600 font-bold' : ''}>
                    {line.loading_percent}%
                  </span>
                </div>
              </div>

              <button
                onClick={() => toggleLine(line.id)}
                className={`w-full py-1 rounded text-[11px] font-bold transition ${
                  !isTripped
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {!isTripped ? 'Trip Breaker (N-1)' : 'Reclose Line'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);