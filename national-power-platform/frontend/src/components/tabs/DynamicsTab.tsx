'use client';

import React, { useState } from 'react';
import { DynamicSimResult, MultiMachineResult, BusData } from '@/types/grid';
import {
  Activity,
  Play,
  RefreshCw,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Flame,
  Zap,
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
  buses: BusData[];
  onRunMultiMachine: (params: {
    fault_bus_id: number;
    fault_duration_ms: number;
  }) => Promise<MultiMachineResult>;
}

export const DynamicsTab: React.FC<Props> = ({
  dynResult,
  dynLoading,
  onRunSimulation,
  buses,
  onRunMultiMachine,
}) => {
  const [activeMode, setActiveMode] = useState<'frequency' | 'rotor_angles'>('frequency');

  // Lumped Parameters Deck
  const [disturbanceMw, setDisturbanceMw] = useState(650.0);
  const [inertiaH, setInertiaH] = useState(4.5);
  const [enableGovernor, setEnableGovernor] = useState(true);
  const [droopR, setDroopR] = useState(0.05);
  const [enablePss, setEnablePss] = useState(true);
  const [pssGain, setPssGain] = useState(25.0);
  const [enableUfls, setEnableUfls] = useState(true);

  // Multi-Machine Parameters Deck
  const [faultBusId, setFaultBusId] = useState<number>(buses[0]?.id || 12);
  const [faultDurationMs, setFaultDurationMs] = useState<number>(140);
  const [mmLoading, setMmLoading] = useState(false);
  const [mmResult, setMmResult] = useState<MultiMachineResult | null>(null);

  const handleSimulateFreq = () => {
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

  const handleSimulateMM = async () => {
    setMmLoading(true);
    try {
      const res = await onRunMultiMachine({
        fault_bus_id: faultBusId,
        fault_duration_ms: faultDurationMs,
      });
      setMmResult(res);
    } finally {
      setMmLoading(false);
    }
  };

  const renderFrequencyChart = () => {
    if (!dynResult || dynResult.time.length === 0) return null;

    const width = 850;
    const height = 320;
    const padX = 65;
    const padY = 35;

    const tMax = Math.max(...dynResult.time, 10.0);
    const fMin = 46.5;
    const fMax = 50.5;

    const scaleX = (t: number) => padX + (t / tMax) * (width - padX - 30);
    const scaleY = (f: number) => height - padY - ((f - fMin) / (fMax - fMin)) * (height - padY * 2);

    const pathUfls = dynResult.frequency_ufls
      .map((f, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(dynResult.time[i])} ${scaleY(f)}`)
      .join(' ');

    const pathUnmit = dynResult.frequency_unmitigated
      .map((f, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(dynResult.time[i])} ${scaleY(f)}`)
      .join(' ');

    const y50 = scaleY(50.0);
    const y49_75 = scaleY(49.75);
    const y50_25 = scaleY(50.25);
    const y48_8 = scaleY(48.80);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[320px] select-none">
        <rect x={padX} y={y50_25} width={width - padX - 30} height={y49_75 - y50_25} fill="#10b981" fillOpacity="0.08" />
        <rect x={padX} y={y48_8} width={width - padX - 30} height={scaleY(46.5) - y48_8} fill="#f43f5e" fillOpacity="0.06" />

        <line x1={padX} y1={y50} x2={width - 30} y2={y50} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />
        <text x={padX - 10} y={y50 + 4} fill="#64748b" fontSize="11" fontFamily="monospace" textAnchor="end">50.0 Hz</text>

        <line x1={padX} y1={y49_75} x2={width - 30} y2={y49_75} stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" />
        <text x={padX - 10} y={y49_75 + 4} fill="#10b981" fontSize="10" fontFamily="monospace" textAnchor="end">49.75 Hz</text>

        <line x1={padX} y1={y48_8} x2={width - 30} y2={y48_8} stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4 2" />
        <text x={padX - 10} y={y48_8 + 4} fill="#f43f5e" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">48.80 Hz (UFLS)</text>

        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#334155" strokeWidth="1.5" />
        <line x1={padX} y1={height - padY} x2={width - 30} y2={height - padY} stroke="#334155" strokeWidth="1.5" />

        {[0, 2, 4, 6, 8, 10, 12].map((sec) => (
          <g key={sec} transform={`translate(${scaleX(sec)}, ${height - padY + 18})`}>
            <text fill="#64748b" fontSize="11" fontFamily="monospace" textAnchor="middle">{sec}s</text>
          </g>
        ))}

        <path d={pathUnmit} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="6 4" />
        <path d={pathUfls} fill="none" stroke="#10b981" strokeWidth="3" />

        {dynResult.ufls_events.map((evt, idx) => {
          const cx = scaleX(evt.timestamp_s);
          const cy = scaleY(evt.frequency_at_trip);
          return (
            <g key={idx} transform={`translate(${cx}, ${cy})`}>
              <circle r="6" fill="#f43f5e" stroke="#ffffff" strokeWidth="2" />
              <text x="8" y="-6" fill="#f43f5e" fontSize="10" fontFamily="monospace" fontWeight="bold">
                {`Stage ${evt.stage} (-${evt.mw_shed}MW)`}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const renderMultiMachineChart = () => {
    if (!mmResult || mmResult.generators.length === 0) return null;

    const width = 850;
    const height = 340;
    const padX = 65;
    const padY = 35;

    const tMax = Math.max(...mmResult.time, 4.0);
    const angleMin = -40;
    const angleMax = 200;

    const scaleX = (t: number) => padX + (t / tMax) * (width - padX - 30);
    const scaleY = (a: number) => height - padY - ((a - angleMin) / (angleMax - angleMin)) * (height - padY * 2);

    const y0 = scaleY(0.0);
    const y180 = scaleY(180.0);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[340px] select-none">
        <rect x={padX} y={scaleY(200)} width={width - padX - 30} height={y180 - scaleY(200)} fill="#f43f5e" fillOpacity="0.08" />
        <rect x={padX} y={scaleY(120)} width={width - padX - 30} height={y0 - scaleY(120)} fill="#10b981" fillOpacity="0.04" />

        <line x1={padX} y1={y180} x2={width - 30} y2={y180} stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x={padX - 10} y={y180 + 4} fill="#f43f5e" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">
          180° (Pole Slip)
        </text>

        <line x1={padX} y1={y0} x2={width - 30} y2={y0} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />
        <text x={padX - 10} y={y0 + 4} fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="end">
          0° (Slack)
        </text>

        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#334155" strokeWidth="1.5" />
        <line x1={padX} y1={height - padY} x2={width - 30} y2={height - padY} stroke="#334155" strokeWidth="1.5" />

        {[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map((sec) => (
          <g key={sec} transform={`translate(${scaleX(sec)}, ${height - padY + 18})`}>
            <text fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="middle">{sec}s</text>
          </g>
        ))}

        {(() => {
          const xFaultStart = scaleX(1.0);
          const xFaultEnd = scaleX(1.0 + mmResult.fault_duration_ms / 1000.0);
          return (
            <g>
              <rect x={xFaultStart} y={padY} width={xFaultEnd - xFaultStart} height={height - padY * 2} fill="#fbbf24" fillOpacity="0.15" />
              <line x1={xFaultStart} y1={padY} x2={xFaultStart} y2={height - padY} stroke="#fbbf24" strokeWidth="1.5" />
              <line x1={xFaultEnd} y1={padY} x2={xFaultEnd} y2={height - padY} stroke="#f43f5e" strokeWidth="1.5" />
              <text x={(xFaultStart + xFaultEnd) / 2} y={padY + 14} fill="#fbbf24" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                {`FAULT (${mmResult.fault_duration_ms}ms)`}
              </text>
            </g>
          );
        })()}

        {mmResult.generators.map((gen) => {
          const path = gen.relative_angle_deg
            .map((angle, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(mmResult.time[i])} ${scaleY(angle)}`)
            .join(' ');

          return (
            <path
              key={gen.id}
              d={path}
              fill="none"
              stroke={gen.color}
              strokeWidth={gen.is_slack ? 3.2 : 2.4}
              className="transition-all"
            />
          );
        })}
      </svg>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Dynamic Stability & Transient Security Studio
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Lumped center-of-inertia frequency defense and multi-machine rotor angle stability analysis.
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-xs">
          <button
            onClick={() => setActiveMode('frequency')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
              activeMode === 'frequency'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Lumped Frequency & UFLS</span>
          </button>
          <button
            onClick={() => setActiveMode('rotor_angles')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
              activeMode === 'rotor_angles'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCw className="h-4 w-4 text-emerald-400" />
            <span>Multi-Machine Angles & CCT</span>
          </button>
        </div>
      </div>

      {/* MODE 1: LUMPED FREQUENCY RESPONSE & UFLS */}
      {activeMode === 'frequency' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-[#500b50]" />
                <span>Disturbance & Control Parameters</span>
              </span>

              <button
                onClick={handleSimulateFreq}
                disabled={dynLoading}
                className="flex items-center gap-2 rounded-xl bg-[#500b50] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
              >
                {dynLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span>Simulate Dynamic Transient</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <label className="block text-xs font-bold uppercase text-slate-600 mb-2">
                  Generation Loss (ΔP)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="50"
                    min="100"
                    max="2000"
                    value={disturbanceMw}
                    onChange={(e) => setDisturbanceMw(Number(e.target.value))}
                    className="w-full font-mono font-bold text-base text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                  <span className="text-slate-500 font-mono text-sm">MW</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <label className="block text-xs font-bold uppercase text-slate-600 mb-2">
                  Grid Inertia (H)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.25"
                    min="2.0"
                    max="7.0"
                    value={inertiaH}
                    onChange={(e) => setInertiaH(Number(e.target.value))}
                    className="w-full font-mono font-bold text-base text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                  <span className="text-slate-500 font-mono text-sm">s</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <label className="block text-xs font-bold uppercase text-slate-600 mb-2">
                  Governor Droop (R)
                </label>
                <input
                  type="number"
                  step="0.005"
                  min="0.03"
                  max="0.08"
                  value={droopR}
                  onChange={(e) => setDroopR(Number(e.target.value))}
                  className="w-full font-mono font-bold text-base text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                />
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <label className="block text-xs font-bold uppercase text-slate-600 mb-2">
                  PSS Gain (K_pss)
                </label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="50"
                  value={pssGain}
                  onChange={(e) => setPssGain(Number(e.target.value))}
                  className="w-full font-mono font-bold text-base text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                />
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Active Controllers
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={enableGovernor}
                      onChange={(e) => setEnableGovernor(e.target.checked)}
                      className="h-4 w-4 accent-[#500b50]"
                    />
                    <span>Turbine Governor</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={enablePss}
                      onChange={(e) => setEnablePss(e.target.checked)}
                      className="h-4 w-4 accent-[#500b50]"
                    />
                    <span>PSS Damping</span>
                  </label>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/60 flex flex-col justify-between">
                <label className="block text-xs font-bold uppercase text-[#500b50] mb-1">
                  NERC UFLS Defense
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableUfls}
                    onChange={(e) => setEnableUfls(e.target.checked)}
                    className="h-5 w-5 accent-[#500b50]"
                  />
                  <span className="text-sm font-bold text-[#500b50]">
                    {enableUfls ? 'Armed (4 Stages)' : 'Disabled'}
                  </span>
                </label>
                <span className="text-xs text-purple-700 mt-1">Triggers at 48.80 Hz</span>
              </div>
            </div>
          </div>

          {/* Metric Summary Cards */}
          {dynResult && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Frequency Nadir</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-2xl font-bold font-mono ${
                    dynResult.metrics.nadir_ufls_hz < 48.80 ? 'text-rose-600' : 'text-emerald-700'
                  }`}>
                    {dynResult.metrics.nadir_ufls_hz.toFixed(2)} Hz
                  </span>
                  <span className="text-xs text-slate-400 line-through">
                    {dynResult.metrics.nadir_unmitigated_hz.toFixed(2)} Hz
                  </span>
                </div>
                <span className="text-xs text-slate-500 mt-1 block">NERC Standard: ≥ 48.80 Hz</span>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Initial RoCoF (df/dt)</span>
                <span className={`text-2xl font-bold font-mono block mt-1 ${
                  dynResult.metrics.rocf_compliant ? 'text-emerald-700' : 'text-rose-600'
                }`}>
                  {dynResult.metrics.initial_rocof_hz_per_s.toFixed(2)} Hz/s
                </span>
                <span className="text-xs text-slate-500 mt-1 block">Limit: ≤ -0.50 Hz/s</span>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Settling Frequency</span>
                <span className={`text-2xl font-bold font-mono block mt-1 ${
                  dynResult.metrics.frequency_band_compliant ? 'text-emerald-700' : 'text-amber-600'
                }`}>
                  {dynResult.metrics.settling_ufls_hz.toFixed(2)} Hz
                </span>
                <span className="text-xs text-slate-500 mt-1 block">Target: 49.75 – 50.25 Hz</span>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Automatic Load Shed</span>
                <span className="text-2xl font-bold font-mono text-[#500b50] block mt-1">
                  {dynResult.metrics.total_load_shed_mw} MW
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  {dynResult.metrics.stages_tripped_count} of 4 Stages Tripped
                </span>
              </div>
            </div>
          )}

          {/* SVG Vector Plot */}
          <div className="rounded-2xl border border-slate-800 bg-[#090e1a] p-6 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 mb-3 text-sm gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-400" />
                <span className="text-slate-100 font-bold">Center-of-Inertia Frequency Response: f(t)</span>
              </div>

              <div className="flex items-center gap-5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-1 bg-[#10b981] rounded-full"></span>
                  <span className="text-emerald-400 font-bold">UFLS & Governor Protected</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-1 bg-[#f43f5e] border-dashed border-b rounded-full"></span>
                  <span className="text-rose-400 font-bold">Unmitigated Trajectory</span>
                </div>
              </div>
            </div>

            {renderFrequencyChart()}
          </div>

          {/* UFLS Sequence Ledger */}
          {dynResult && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                <span>NERC Statutory UFLS Tripping Sequence Ledger</span>
                <span className="font-mono text-emerald-300">
                  {dynResult.ufls_events.length > 0 ? `${dynResult.ufls_events.length} Relays Activated` : 'No UFLS Stages Triggered'}
                </span>
              </div>

              {dynResult.ufls_events.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Frequency remained above 48.80 Hz. No automatic load shedding required.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[650px]">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Stage</th>
                        <th className="py-3 px-4">Trigger Threshold</th>
                        <th className="py-3 px-4">Relay Timestamp</th>
                        <th className="py-3 px-4">Frequency at Trip</th>
                        <th className="py-3 px-4">Shed MW</th>
                        <th className="py-3 px-4">Cumulative Shed</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {dynResult.ufls_events.map((evt) => (
                        <tr key={evt.stage} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-900">Stage {evt.stage}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {evt.stage === 1 ? '48.80 Hz' : evt.stage === 2 ? '48.60 Hz' : evt.stage === 3 ? '48.40 Hz' : '48.20 Hz'}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#500b50]">{evt.timestamp_s}s</td>
                          <td className="py-3 px-4 font-mono text-rose-600 font-bold">{evt.frequency_at_trip} Hz</td>
                          <td className="py-3 px-4 font-mono font-bold text-amber-700">-{evt.mw_shed} MW</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{evt.cumulative_shed_mw} MW</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
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
      )}

      {/* MODE 2: MULTI-MACHINE ROTOR ANGLES & CRITICAL CLEARING TIME */}
      {activeMode === 'rotor_angles' && (
        <div className="space-y-6">
          {/* Fault Configuration Deck */}
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-2">
                  1. Fault Location (Substation Bus)
                </label>
                <select
                  value={faultBusId}
                  onChange={(e) => setFaultBusId(Number(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white"
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {`#${b.id} ${b.name} (${b.vn_kv || 330} kV)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-2">
                  2. Breaker Clearing Duration (t_clear)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="350"
                    step="10"
                    value={faultDurationMs}
                    onChange={(e) => setFaultDurationMs(Number(e.target.value))}
                    className="w-full accent-[#500b50] cursor-pointer"
                  />
                  <span className="font-mono font-bold text-[#500b50] text-base whitespace-nowrap">
                    {faultDurationMs} ms
                  </span>
                </div>
                <span className="text-xs text-slate-400 mt-1 block">
                  {(faultDurationMs / 20).toFixed(1)} protection cycles at 50 Hz
                </span>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleSimulateMM}
                  disabled={mmLoading || buses.length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#500b50] text-white py-3 text-sm font-bold hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
                >
                  {mmLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span>Run Multi-Machine Analysis</span>
                </button>
              </div>
            </div>
          </div>

          {/* Results Summary & Plot */}
          {mmResult && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border text-sm flex items-center justify-between ${
                mmResult.is_transiently_stable
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="flex items-center gap-3.5">
                  {mmResult.is_transiently_stable ? (
                    <ShieldCheck className="h-8 w-8 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-8 w-8 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-black text-base">
                      {mmResult.is_transiently_stable
                        ? 'SYNCHRONOUS COHERENCE MAINTAINED'
                        : `TRANSIENT INSTABILITY: ${mmResult.unstable_generator || 'Machine'} POLE SLIP`}
                    </h4>
                    <p className="text-xs mt-0.5 opacity-90">
                      Fault at {mmResult.fault_bus_name} cleared in {mmResult.fault_duration_ms} ms. All {mmResult.generators.length} machines monitored.
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-xs uppercase font-bold text-slate-500 block">Critical Clearing Time</span>
                  <span className="text-lg font-black text-[#500b50]">
                    {mmResult.cct_ms} ms ({mmResult.cct_cycles} cycles)
                  </span>
                </div>
              </div>

              {/* Multi-Machine Vector Trajectory Plot */}
              <div className="rounded-2xl border border-slate-800 bg-[#090e1a] p-6 shadow-xl relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 mb-3 text-sm gap-2">
                  <div className="flex items-center gap-2">
                    <RotateCw className="h-5 w-5 text-emerald-400" />
                    <span className="text-slate-100 font-bold">
                      Generator Rotor Angles Relative to Slack: (delta_i - delta_slack)
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap text-xs font-mono">
                    {mmResult.generators.map((g) => (
                      <div key={g.id} className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: g.color }}></span>
                        <span className="text-slate-300 font-bold">{g.name.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {renderMultiMachineChart()}
              </div>

              {/* Machine Ledger Table */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="bg-[#500b50] text-white px-5 py-3 text-sm font-bold flex justify-between items-center">
                  <span>Generating Plant Inertia & Transient Angular Excursions</span>
                  <span className="font-normal text-xs text-white/80">
                    Statutory Primary Clearance: ≤ 150 ms (7.5 cycles)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[650px]">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Generating Station</th>
                        <th className="py-3 px-4">Bus Node</th>
                        <th className="py-3 px-4">Inertia (H)</th>
                        <th className="py-3 px-4">Max Excursion</th>
                        <th className="py-3 px-4">CCT Margin</th>
                        <th className="py-3 px-4">Transient Coherence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {mmResult.generators.map((g) => {
                        const isSlipped = g.max_angle_deg >= 180.0;
                        const cctMargin = mmResult.cct_ms - faultDurationMs;

                        return (
                          <tr key={g.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2.5">
                              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: g.color }}></span>
                              <span>{g.name}</span>
                              {g.is_slack && (
                                <span className="px-2 py-0.5 rounded-md bg-purple-100 text-[#500b50] text-xs font-bold">
                                  Slack Ref
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600">Bus #{g.bus_id}</td>
                            <td className="py-3 px-4 font-mono">{g.H} s</td>
                            <td className="py-3 px-4 font-mono font-bold">
                              <span className={isSlipped ? 'text-rose-600' : 'text-slate-900'}>
                                {g.max_angle_deg.toFixed(1)}°
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono">
                              <span className={cctMargin >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                {cctMargin >= 0 ? `+${cctMargin.toFixed(0)} ms` : `${cctMargin.toFixed(0)} ms (Deficit)`}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {isSlipped ? (
                                <span className="inline-flex items-center rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
                                  Pole Slipping
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                                  Synchronous
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};