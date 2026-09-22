'use client';

import React, { useState } from 'react';
import { DynamicSimResult } from '@/types/grid';
import {
  Activity,
  Play,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Sliders,
  Flame,
  CheckCircle2,
  TrendingDown,
  Layers,
} from 'lucide-react';

interface Props {
  dynResult: DynamicSimResult | null;
  dynLoading: boolean;
  onRunSimulation: (params: {
    disturbance_mw: number;
    inertia_constant_H: number;
    enable_governor: boolean;
    droop_R: number;
    enable_pss: boolean;
    pss_gain_K: number;
    enable_ufls: boolean;
  }) => void;
}

export const DynamicsTab: React.FC<Props> = ({
  dynResult,
  dynLoading,
  onRunSimulation,
}) => {
  // Dynamic Parameters Deck
  const [disturbanceMw, setDisturbanceMw] = useState(650.0);
  const [inertiaH, setInertiaH] = useState(4.5);
  const [enableGovernor, setEnableGovernor] = useState(true);
  const [droopR, setDroopR] = useState(0.05);
  const [enablePss, setEnablePss] = useState(true);
  const [pssGain, setPssGain] = useState(25.0);
  const [enableUfls, setEnableUfls] = useState(true);

  const handleSimulate = () => {
    onRunSimulation({
      disturbance_mw: disturbanceMw,
      inertia_constant_H: inertiaH,
      enable_governor: enableGovernor,
      droop_R: droopR,
      enable_pss: enablePss,
      pss_gain_K: pssGain,
      enable_ufls: enableUfls,
    });
  };

  // SVG Chart Projection
  const renderFrequencyChart = () => {
    if (!dynResult || dynResult.time.length === 0) return null;

    const width = 850;
    const height = 320;
    const padX = 60;
    const padY = 30;

    const tMax = Math.max(...dynResult.time, 10.0);
    const fMin = 46.5;
    const fMax = 50.5;

    const scaleX = (t: number) => padX + (t / tMax) * (width - padX - 30);
    const scaleY = (f: number) => height - padY - ((f - fMin) / (fMax - fMin)) * (height - padY * 2);

    // Build SVG Path for UFLS Stabilized Frequency
    const pathUfls = dynResult.frequency_ufls
      .map((f, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(dynResult.time[i])} ${scaleY(f)}`)
      .join(' ');

    // Build SVG Path for Unmitigated Frequency
    const pathUnmit = dynResult.frequency_unmitigated
      .map((f, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(dynResult.time[i])} ${scaleY(f)}`)
      .join(' ');

    const y50 = scaleY(50.0);
    const y49_75 = scaleY(49.75);
    const y50_25 = scaleY(50.25);
    const y48_8 = scaleY(48.80);
    const y48_2 = scaleY(48.20);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[320px] select-none">
        {/* Statutory Compliance Shading: Operational Band (49.75 - 50.25 Hz) */}
        <rect
          x={padX}
          y={y50_25}
          width={width - padX - 30}
          height={y49_75 - y50_25}
          fill="#10b981"
          fillOpacity="0.08"
        />

        {/* Severe Hazard Shading (Below 48.80 Hz) */}
        <rect
          x={padX}
          y={y48_8}
          width={width - padX - 30}
          height={scaleY(46.5) - y48_8}
          fill="#f43f5e"
          fillOpacity="0.06"
        />

        {/* Horizontal Reference Lines */}
        <line x1={padX} y1={y50} x2={width - 30} y2={y50} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />
        <text x={padX - 8} y={y50 + 3.5} fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="end">
          50.0 Hz
        </text>

        <line x1={padX} y1={y49_75} x2={width - 30} y2={y49_75} stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" />
        <text x={padX - 8} y={y49_75 + 3.5} fill="#10b981" fontSize="9" fontFamily="monospace" textAnchor="end">
          49.75 Hz
        </text>

        <line x1={padX} y1={y48_8} x2={width - 30} y2={y48_8} stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4 2" />
        <text x={padX - 8} y={y48_8 + 3.5} fill="#f43f5e" fontSize="9.5" fontFamily="monospace" fontWeight="bold" textAnchor="end">
          48.80 Hz (UFLS)
        </text>

        {/* Y Axis Line */}
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#334155" strokeWidth="1.5" />
        {/* X Axis Line */}
        <line x1={padX} y1={height - padY} x2={width - 30} y2={height - padY} stroke="#334155" strokeWidth="1.5" />

        {/* X Axis Time Labels */}
        {[0, 2, 4, 6, 8, 10, 12].map((sec) => (
          <g key={sec} transform={`translate(${scaleX(sec)}, ${height - padY + 16})`}>
            <text fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="middle">
              {sec}s
            </text>
          </g>
        ))}

        {/* 1. Unmitigated Trajectory (Red Dashed) */}
        <path
          d={pathUnmit}
          fill="none"
          stroke="#f43f5e"
          strokeWidth="2.2"
          strokeDasharray="5 4"
        />

        {/* 2. UFLS + Governor Stabilized Trajectory (Solid Emerald) */}
        <path
          d={pathUfls}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.8"
        />

        {/* UFLS Trip Markers */}
        {dynResult.ufls_events.map((evt, idx) => {
          const cx = scaleX(evt.timestamp_s);
          const cy = scaleY(evt.frequency_at_trip);
          return (
            <g key={idx} transform={`translate(${cx}, ${cy})`}>
              <circle r="5" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.5" />
              <text x="7" y="-5" fill="#f43f5e" fontSize="9" fontFamily="monospace" fontWeight="bold">
                Stage {evt.stage} (-{evt.mw_shed}MW)
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">
            Time-Domain Frequency Dynamics & NERC UFLS Defense
          </h2>
          <p className="text-xs text-slate-500">
            Center-of-Inertia Swing Simulation, RoCoF Acceleration, and Automated 4-Stage Load Shedding.
          </p>
        </div>

        <button
          onClick={handleSimulate}
          disabled={dynLoading}
          className="flex items-center gap-2 rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs disabled:opacity-50"
        >
          {dynLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          <span>Simulate Dynamic Transient</span>
        </button>
      </div>

      {/* Dynamic Parameters Deck */}
      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3">
        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
          <Sliders className="h-3.5 w-3.5 text-[#500b50]" />
          <span>Dynamic Disturbance & Control Settings</span>
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Generation Loss MW */}
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Generation Loss ($\Delta P$)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="50"
                min="100"
                max="2000"
                value={disturbanceMw}
                onChange={(e) => setDisturbanceMw(Number(e.target.value))}
                className="w-full font-mono font-bold text-slate-900 bg-white border rounded px-2 py-1 text-xs"
              />
              <span className="text-slate-500 text-[10px]">MW</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">e.g. Egbin or Kainji trip</span>
          </div>

          {/* Inertia Constant H */}
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Grid Inertia ($H_{eq}$)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.25"
                min="2.0"
                max="7.0"
                value={inertiaH}
                onChange={(e) => setInertiaH(Number(e.target.value))}
                className="w-full font-mono font-bold text-slate-900 bg-white border rounded px-2 py-1 text-xs"
              />
              <span className="text-slate-500 text-[10px]">s</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Stored rotational kinetic</span>
          </div>

          {/* Droop Regulation R */}
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Governor Droop ($R$)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.005"
                min="0.03"
                max="0.08"
                value={droopR}
                onChange={(e) => setDroopR(Number(e.target.value))}
                className="w-full font-mono font-bold text-slate-900 bg-white border rounded px-2 py-1 text-xs"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">4 - 5% statutory droop</span>
          </div>

          {/* PSS Lead-Lag Gain */}
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              PSS Gain ($K_{pss}$)
            </label>
            <input
              type="number"
              step="5"
              min="0"
              max="50"
              value={pssGain}
              onChange={(e) => setPssGain(Number(e.target.value))}
              className="w-full font-mono font-bold text-slate-900 bg-white border rounded px-2 py-1 text-xs"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Inter-area damping</span>
          </div>

          {/* Governor & PSS Toggles */}
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
            <label className="block text-[10px] font-bold uppercase text-slate-500">
              Active Controllers
            </label>
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableGovernor}
                  onChange={(e) => setEnableGovernor(e.target.checked)}
                  className="accent-[#500b50]"
                />
                <span className="text-[11px] font-medium text-slate-700">Turbine Governor</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enablePss}
                  onChange={(e) => setEnablePss(e.target.checked)}
                  className="accent-[#500b50]"
                />
                <span className="text-[11px] font-medium text-slate-700">PSS Damping</span>
              </label>
            </div>
          </div>

          {/* UFLS Defense Toggle */}
          <div className="p-2.5 rounded border border-purple-200 bg-purple-50/60 flex flex-col justify-between">
            <label className="block text-[10px] font-bold uppercase text-[#500b50]">
              NERC UFLS Defense
            </label>
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={enableUfls}
                onChange={(e) => setEnableUfls(e.target.checked)}
                className="h-4 w-4 accent-[#500b50]"
              />
              <span className="text-xs font-bold text-[#500b50]">
                {enableUfls ? 'Armed (4 Stages)' : 'Disabled'}
              </span>
            </label>
            <span className="text-[10px] text-purple-700 mt-1 block">
              Triggers at 48.80 Hz
            </span>
          </div>
        </div>
      </div>

      {/* Compliance Metrics Summary Cards */}
      {dynResult && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-lg border border-slate-200 bg-white shadow-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Frequency Nadir</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-xl font-bold font-mono ${
                dynResult.metrics.nadir_ufls_hz < 48.80 ? 'text-rose-600' : 'text-emerald-700'
              }`}>
                {dynResult.metrics.nadir_ufls_hz.toFixed(2)} Hz
              </span>
              <span className="text-[10px] text-slate-400 line-through">
                {dynResult.metrics.nadir_unmitigated_hz.toFixed(2)} Hz
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              NERC Limit: $\ge 48.80\text{ Hz}$
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-white shadow-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Initial RoCoF ($df/dt$)</span>
            <span className={`text-xl font-bold font-mono block mt-1 ${
              dynResult.metrics.rocf_compliant ? 'text-emerald-700' : 'text-rose-600'
            }`}>
              {dynResult.metrics.initial_rocof_hz_per_s.toFixed(2)} Hz/s
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Protection Bound: $\le -0.50\text{ Hz/s}$
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-white shadow-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Settling Frequency</span>
            <span className={`text-xl font-bold font-mono block mt-1 ${
              dynResult.metrics.frequency_band_compliant ? 'text-emerald-700' : 'text-amber-600'
            }`}>
              {dynResult.metrics.settling_ufls_hz.toFixed(2)} Hz
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Target: $49.75 - 50.25\text{ Hz}$
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-white shadow-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Load Shed (UFLS)</span>
            <span className="text-xl font-bold font-mono text-purple-900 block mt-1">
              {dynResult.metrics.total_load_shed_mw} MW
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {dynResult.metrics.stages_tripped_count} of 4 Stages Tripped
            </span>
          </div>
        </div>
      )}

      {/* Interactive Vector Curve */}
      <div className="rounded-lg border border-slate-800 bg-[#090e1a] p-4 shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 text-xs">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-slate-200 font-bold">Center-of-Inertia Frequency Response: $f(t)$ Trajectory</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-[#10b981]"></span>
              <span className="text-emerald-400">UFLS + Governor Protected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-[#f43f5e] border-dashed border-b"></span>
              <span className="text-rose-400">Unmitigated Trajectory</span>
            </div>
          </div>
        </div>

        {renderFrequencyChart()}
      </div>

      {/* UFLS Breaker Tripping Sequence Ledger */}
      {dynResult && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
          <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
            <span>NERC Statutory UFLS Tripping Sequence Ledger</span>
            <span className="font-mono text-emerald-300">
              {dynResult.ufls_events.length > 0 ? `${dynResult.ufls_events.length} Relays Activated` : 'No UFLS Stages Triggered'}
            </span>
          </div>

          {dynResult.ufls_events.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              System frequency remained above 48.80 Hz. No automatic under-frequency load shedding required.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[550px]">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="p-3">UFLS Stage</th>
                    <th className="p-3">Trigger Threshold</th>
                    <th className="p-3">Relay Timestamp</th>
                    <th className="p-3">Frequency at Trip</th>
                    <th className="p-3">Shed Quantity (MW)</th>
                    <th className="p-3">Cumulative Load Shed</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {dynResult.ufls_events.map((evt) => (
                    <tr key={evt.stage} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">Stage {evt.stage}</td>
                      <td className="p-3 font-mono text-slate-600">
                        {evt.stage === 1 ? '48.80 Hz' : evt.stage === 2 ? '48.60 Hz' : evt.stage === 3 ? '48.40 Hz' : '48.20 Hz'}
                      </td>
                      <td className="p-3 font-mono font-bold text-purple-900">{evt.timestamp_s}s</td>
                      <td className="p-3 font-mono text-rose-600 font-bold">{evt.frequency_at_trip} Hz</td>
                      <td className="p-3 font-mono font-bold text-amber-700">-{evt.mw_shed} MW</td>
                      <td className="p-3 font-mono font-bold text-slate-900">{evt.cumulative_shed_mw} MW</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                          Breaker Open
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};