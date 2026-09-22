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

  // SVG Chart: Lumped Center-of-Inertia Frequency
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
        <text x={padX - 8} y={y50 + 3.5} fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="end">50.0 Hz</text>

        <line x1={padX} y1={y49_75} x2={width - 30} y2={y49_75} stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" />
        <text x={padX - 8} y={y49_75 + 3.5} fill="#10b981" fontSize="9" fontFamily="monospace" textAnchor="end">49.75 Hz</text>

        <line x1={padX} y1={y48_8} x2={width - 30} y2={y48_8} stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4 2" />
        <text x={padX - 8} y={y48_8 + 3.5} fill="#f43f5e" fontSize="9.5" fontFamily="monospace" fontWeight="bold" textAnchor="end">48.80 Hz (UFLS)</text>

        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#334155" strokeWidth="1.5" />
        <line x1={padX} y1={height - padY} x2={width - 30} y2={height - padY} stroke="#334155" strokeWidth="1.5" />

        {[0, 2, 4, 6, 8, 10, 12].map((sec) => (
          <g key={sec} transform={`translate(${scaleX(sec)}, ${height - padY + 16})`}>
            <text fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="middle">{sec}s</text>
          </g>
        ))}

        <path d={pathUnmit} fill="none" stroke="#f43f5e" strokeWidth="2.2" strokeDasharray="5 4" />
        <path d={pathUfls} fill="none" stroke="#10b981" strokeWidth="2.8" />

        {dynResult.ufls_events.map((evt, idx) => {
          const cx = scaleX(evt.timestamp_s);
          const cy = scaleY(evt.frequency_at_trip);
          return (
            <g key={idx} transform={`translate(${cx}, ${cy})`}>
              <circle r="5" fill="#f43f5e" stroke="#ffffff" strokeWidth="1.5" />
              <text x="7" y="-5" fill="#f43f5e" fontSize="9" fontFamily="monospace" fontWeight="bold">
                {`Stage ${evt.stage} (-${evt.mw_shed}MW)`}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // SVG Chart: Multi-Machine Rotor Angle Trajectories
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
        <text x={padX - 8} y={y180 + 3.5} fill="#f43f5e" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="end">
          180° (Pole Slip)
        </text>

        <line x1={padX} y1={y0} x2={width - 30} y2={y0} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />
        <text x={padX - 8} y={y0 + 3.5} fill="#64748b" fontSize="9.5" fontFamily="monospace" textAnchor="end">
          0° (Slack)
        </text>

        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#334155" strokeWidth="1.5" />
        <line x1={padX} y1={height - padY} x2={width - 30} y2={height - padY} stroke="#334155" strokeWidth="1.5" />

        {[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map((sec) => (
          <g key={sec} transform={`translate(${scaleX(sec)}, ${height - padY + 16})`}>
            <text fill="#64748b" fontSize="9.5" fontFamily="monospace" textAnchor="middle">{sec}s</text>
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
              <text x={(xFaultStart + xFaultEnd) / 2} y={padY + 14} fill="#fbbf24" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
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
              strokeWidth={gen.is_slack ? 3.0 : 2.2}
              className="transition-all"
            />
          );
        })}
      </svg>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">
            Time-Domain Dynamics & Transient Stability Engine
          </h2>
          <p className="text-xs text-slate-500">
            Center-of-Inertia frequency defense or multi-machine rotor angle stability and Critical Clearing Time (CCT).
          </p>
        </div>

        <div className="flex rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs">
          <button
            onClick={() => setActiveMode('frequency')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded font-bold transition ${
              activeMode === 'frequency'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Lumped Frequency (UFLS)</span>
          </button>
          <button
            onClick={() => setActiveMode('rotor_angles')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded font-bold transition ${
              activeMode === 'rotor_angles'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCw className="h-3.5 w-3.5 text-emerald-400" />
            <span>Multi-Machine Angles (CCT)</span>
          </button>
        </div>
      </div>

      {/* MODE 1: LUMPED FREQUENCY RESPONSE & UFLS */}
      {activeMode === 'frequency' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-[#500b50]" />
                <span>Dynamic Disturbance & Control Settings</span>
              </span>

              <button
                onClick={handleSimulateFreq}
                disabled={dynLoading}
                className="flex items-center gap-2 rounded bg-[#500b50] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs disabled:opacity-50"
              >
                {dynLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span>Simulate Dynamic Transient</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Generation Loss (ΔP)
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

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Grid Inertia (H)
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
                <span className="text-[10px] text-slate-400 mt-1 block">Stored kinetic energy</span>
              </div>

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Governor Droop (R)
                </label>
                <input
                  type="number"
                  step="0.005"
                  min="0.03"
                  max="0.08"
                  value={droopR}
                  onChange={(e) => setDroopR(Number(e.target.value))}
                  className="w-full font-mono font-bold text-slate-900 bg-white border rounded px-2 py-1 text-xs"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">4 – 5% statutory droop</span>
              </div>

              <div className="p-2.5 rounded border border-slate-200 bg-slate-50/60">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  PSS Gain (K_pss)
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

          {/* Frequency Metrics */}
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
                <span className="text-[10px] text-slate-500 mt-1 block">NERC Limit: ≥ 48.80 Hz</span>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-white shadow-xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Initial RoCoF (df/dt)</span>
                <span className={`text-xl font-bold font-mono block mt-1 ${
                  dynResult.metrics.rocf_compliant ? 'text-emerald-700' : 'text-rose-600'
                }`}>
                  {dynResult.metrics.initial_rocof_hz_per_s.toFixed(2)} Hz/s
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">Protection Bound: ≤ -0.50 Hz/s</span>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-white shadow-xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Settling Frequency</span>
                <span className={`text-xl font-bold font-mono block mt-1 ${
                  dynResult.metrics.frequency_band_compliant ? 'text-emerald-700' : 'text-amber-600'
                }`}>
                  {dynResult.metrics.settling_ufls_hz.toFixed(2)} Hz
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">Target: 49.75 – 50.25 Hz</span>
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
                <span className="text-slate-200 font-bold">Center-of-Inertia Frequency Response: f(t) Trajectory</span>
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
        </div>
      )}

      {/* MODE 2: MULTI-MACHINE ROTOR ANGLES & CRITICAL CLEARING TIME */}
      {activeMode === 'rotor_angles' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-purple-200 bg-[#fcfaff] text-xs">
            <h3 className="font-bold text-[#500b50] text-sm flex items-center gap-2">
              <RotateCw className="h-4 w-4 text-[#500b50]" />
              <span>Multi-Machine Transient Angle Stability & Critical Clearing Time (CCT)</span>
            </h3>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Solves coupled machine swing equations following a 3-phase symmetrical short-circuit. Evaluates generator angular separation relative to the Egbin slack bus (delta_i - delta_slack). Exceeding 180° signifies loss of synchronism (pole slipping).
            </p>
          </div>

          {/* Fault Simulation Configuration */}
          <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  1. Fault Location (Substation Bus)
                </label>
                <select
                  value={faultBusId}
                  onChange={(e) => setFaultBusId(Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {`#${b.id} ${b.name} (${b.vn_kv || 330} kV)`}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">Location of 3-phase bolted short-circuit</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  2. Breaker Clearing Duration (t_clear)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="50"
                    max="350"
                    step="10"
                    value={faultDurationMs}
                    onChange={(e) => setFaultDurationMs(Number(e.target.value))}
                    className="w-full accent-[#500b50] cursor-pointer"
                  />
                  <span className="font-mono font-bold text-purple-900 text-sm whitespace-nowrap">
                    {faultDurationMs} ms
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {(faultDurationMs / 20).toFixed(1)} protection cycles at 50 Hz
                </span>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleSimulateMM}
                  disabled={mmLoading || buses.length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded bg-[#500b50] text-white py-2 text-xs font-bold hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
                >
                  {mmLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span>Run Multi-Machine Stability Analysis</span>
                </button>
              </div>
            </div>
          </div>

          {/* Results Summary */}
          {mmResult && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border text-xs flex items-center justify-between ${
                mmResult.is_transiently_stable
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="flex items-center gap-3">
                  {mmResult.is_transiently_stable ? (
                    <ShieldCheck className="h-7 w-7 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-7 w-7 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm">
                      {mmResult.is_transiently_stable
                        ? 'SYNCHRONOUS COHERENCE MAINTAINED'
                        : `TRANSIENT INSTABILITY: ${mmResult.unstable_generator || 'Machine'} POLE SLIP`}
                    </h4>
                    <p className="text-[11px] mt-0.5">
                      Fault at {mmResult.fault_bus_name} cleared in {mmResult.fault_duration_ms} ms. All {mmResult.generators.length} machines monitored.
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Critical Clearing Time (CCT)</span>
                  <span className="text-base font-bold text-purple-900">
                    {mmResult.cct_ms} ms ({mmResult.cct_cycles} cycles)
                  </span>
                </div>
              </div>

              {/* Multi-Machine Vector Trajectory Plot */}
              <div className="rounded-lg border border-slate-800 bg-[#090e1a] p-4 shadow-lg relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-2 mb-2 text-xs gap-2">
                  <div className="flex items-center gap-2">
                    <RotateCw className="h-4 w-4 text-emerald-400" />
                    <span className="text-slate-200 font-bold">
                      Generator Rotor Angles Relative to Slack: (delta_i(t) - delta_slack)
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono">
                    {mmResult.generators.map((g) => (
                      <div key={g.id} className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }}></span>
                        <span className="text-slate-300">{g.name.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {renderMultiMachineChart()}
              </div>

              {/* Machine Ledger Table */}
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="bg-[#500b50] text-white px-4 py-2.5 text-xs font-bold flex justify-between items-center">
                  <span>Generating Plant Inertia & Transient Angular Excursions</span>
                  <span className="font-normal text-[11px] text-white/80">
                    Statutory Primary Clearance: ≤ 150 ms (7.5 cycles)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="p-3">Generating Station</th>
                        <th className="p-3">Bus Node</th>
                        <th className="p-3">Inertia (H)</th>
                        <th className="p-3">Max Angular Excursion</th>
                        <th className="p-3">CCT Margin</th>
                        <th className="p-3">Transient Coherence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {mmResult.generators.map((g) => {
                        const isSlipped = g.max_angle_deg >= 180.0;
                        const cctMargin = mmResult.cct_ms - faultDurationMs;

                        return (
                          <tr key={g.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }}></span>
                              <span>{g.name}</span>
                              {g.is_slack && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-100 text-[#500b50] text-[9px] font-bold">
                                  Slack Ref
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-500">Bus #{g.bus_id}</td>
                            <td className="p-3 font-mono">{g.H} s</td>
                            <td className="p-3 font-mono font-bold">
                              <span className={isSlipped ? 'text-rose-600' : 'text-slate-800'}>
                                {g.max_angle_deg.toFixed(1)}°
                              </span>
                            </td>
                            <td className="p-3 font-mono">
                              <span className={cctMargin >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                {cctMargin >= 0 ? `+${cctMargin.toFixed(0)} ms` : `${cctMargin.toFixed(0)} ms (Deficit)`}
                              </span>
                            </td>
                            <td className="p-3">
                              {isSlipped ? (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                  Pole Slipping
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
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