'use client';

import React, { useState, useRef } from 'react';
import { DynamicSimResult, BusData } from '@/types/grid';
import {
  Activity,
  Play,
  RefreshCw,
  Sliders,
  ShieldAlert,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
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
  onRunMultiMachine?: (params: { fault_bus_id: number; fault_duration_ms: number }) => Promise<any>;
}

export const DynamicsTab: React.FC<Props> = ({
  dynResult,
  dynLoading,
  onRunSimulation,
  buses,
  onRunMultiMachine,
}) => {
  const [subView, setSubView] = useState<'lumped' | 'multimachine'>('lumped');

  // Lumped Parameters
  const [disturbanceMw, setDisturbanceMw] = useState<number>(650.0);
  const [inertiaH, setInertiaH] = useState<number>(4.5);
  const [droopR, setDroopR] = useState<number>(0.05);
  const [pssGain, setPssGain] = useState<number>(25.0);
  const [enableGov, setEnableGov] = useState<boolean>(true);
  const [enablePss, setEnablePss] = useState<boolean>(true);
  const [enableUfls, setEnableUfls] = useState<boolean>(true);

  // Multi-Machine Parameters
  const [faultBus, setFaultBus] = useState<number>(buses[0]?.id || 1);
  const [breakerDuration, setBreakerDuration] = useState<number>(60.0);
  const [mmLoading, setMmLoading] = useState<boolean>(false);
  const [mmResult, setMmResult] = useState<any>(null);

  // SVG Refs for Direct Image Export
  const freqSvgRef = useRef<SVGSVGElement | null>(null);
  const angleSvgRef = useRef<SVGSVGElement | null>(null);

  const handleSimulateLumped = () => {
    onRunSimulation({
      disturbance_mw: disturbanceMw,
      inertia_constant_H: inertiaH,
      enable_governor: enableGov,
      droop_R: droopR,
      enable_pss: enablePss,
      pss_gain_K: pssGain,
      enable_ufls: enableUfls,
    });
  };

  const handleSimulateMultiMachine = async () => {
    if (!onRunMultiMachine) return;
    setMmLoading(true);
    try {
      const res = await onRunMultiMachine({
        fault_bus_id: faultBus,
        fault_duration_ms: breakerDuration,
      });
      setMmResult(res);
    } finally {
      setMmLoading(false);
    }
  };

  // Safe Property Resolvers
  const unmitigatedSeries: number[] =
    dynResult?.f_unmitigated || dynResult?.frequency_unmitigated || [];
  const protectedSeries: number[] =
    dynResult?.f_protected || dynResult?.frequency_ufls || [];
  const nadirVal: number =
    dynResult?.nadir_hz ?? dynResult?.nadir ?? dynResult?.metrics?.nadir ?? 50.0;
  const rocofVal: number =
    dynResult?.initial_rocof ?? dynResult?.rocof ?? dynResult?.metrics?.rocof ?? 0.0;
  const settlingVal: number =
    dynResult?.settling_hz ?? dynResult?.metrics?.settling_hz ?? 50.0;
  const totalShedVal: number =
    dynResult?.total_shed_mw ?? dynResult?.metrics?.total_shed_mw ?? 0;
  const stagesTrippedVal: number =
    dynResult?.stages_tripped ?? dynResult?.metrics?.stages_tripped ?? 0;
  const uflsEvents = dynResult?.ufls_events || [];

  // Export Graph as SVG
  const exportAsSVG = (svgRef: React.RefObject<SVGSVGElement | null>, filename: string) => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Graph as PNG
  const exportAsPNG = (svgRef: React.RefObject<SVGSVGElement | null>, filename: string) => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 700;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${filename}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Export CSV Telemetry
  const exportFrequencyCSV = () => {
    if (!dynResult) return;
    let csv = 'Time_s,Unmitigated_Hz,Protected_Hz\n';
    dynResult.time.forEach((t, i) => {
      csv += `${t},${unmitigatedSeries[i] ?? ''},${protectedSeries[i] ?? ''}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NESI_Frequency_Response_Telemetry.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAngleCSV = () => {
    if (!mmResult) return;
    let csv = 'Time_s,' + mmResult.trajectories.map((m: any) => `"${m.name}"`).join(',') + '\n';
    mmResult.time.forEach((t: number, i: number) => {
      const row = [t, ...mmResult.trajectories.map((m: any) => m.angles[i])];
      csv += row.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NESI_MultiMachine_Angles_Telemetry.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // SVG Coordinate Helpers
  const svgWidth = 850;
  const svgHeight = 280;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;

  const mapX = (t: number, maxT: number) =>
    padLeft + (t / maxT) * (svgWidth - padLeft - padRight);

  const mapFreqY = (f: number) => {
    const minF = 46.0;
    const maxF = 50.5;
    const clamped = Math.max(minF, Math.min(maxF, f));
    return padTop + ((maxF - clamped) / (maxF - minF)) * (svgHeight - padTop - padBottom);
  };

  const mapAngleY = (deg: number) => {
    const minDeg = -30.0;
    const maxDeg = 210.0;
    const clamped = Math.max(minDeg, Math.min(maxDeg, deg));
    return padTop + ((maxDeg - clamped) / (maxDeg - minDeg)) * (svgHeight - padTop - padBottom);
  };

  const MACHINE_COLORS = [
    '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
    '#fb923c', '#2dd4bf', '#ec4899', '#60a5fa', '#c084fc',
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Navigation */}
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
            onClick={() => setSubView('lumped')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
              subView === 'lumped' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Lumped Frequency & UFLS</span>
          </button>

          <button
            onClick={() => {
              setSubView('multimachine');
              if (!mmResult) handleSimulateMultiMachine();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
              subView === 'multimachine' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Multi-Machine Angles & CCT</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: LUMPED FREQUENCY RESPONSE                                         */}
      {/* ========================================================================= */}
      {subView === 'lumped' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Disturbance & Control Parameters
              </span>
              <button
                onClick={handleSimulateLumped}
                disabled={dynLoading}
                className="flex items-center gap-2 rounded-xl bg-[#500b50] px-5 py-2 text-sm font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
              >
                {dynLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span>Simulate Dynamic Transient</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Generation Loss (ΔP)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="50"
                    min="100"
                    max="2000"
                    value={disturbanceMw}
                    onChange={(e) => setDisturbanceMw(parseFloat(e.target.value) || 650)}
                    className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm"
                  />
                  <span className="text-xs text-slate-500 font-mono">MW</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Grid Inertia (H)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="1.5"
                    max="8.0"
                    value={inertiaH}
                    onChange={(e) => setInertiaH(parseFloat(e.target.value) || 4.5)}
                    className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm"
                  />
                  <span className="text-xs text-slate-500 font-mono">s</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Governor Droop (R)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.02"
                  max="0.10"
                  value={droopR}
                  onChange={(e) => setDroopR(parseFloat(e.target.value) || 0.05)}
                  className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  PSS Gain (K_pss)
                </label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="50"
                  value={pssGain}
                  onChange={(e) => setPssGain(parseFloat(e.target.value) || 25)}
                  className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-center space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={enableGov}
                    onChange={(e) => setEnableGov(e.target.checked)}
                    className="rounded text-[#500b50] accent-[#500b50]"
                  />
                  <span>Turbine Governor</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={enablePss}
                    onChange={(e) => setEnablePss(e.target.checked)}
                    className="rounded text-[#500b50] accent-[#500b50]"
                  />
                  <span>PSS Damping</span>
                </label>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-900">
                  <input
                    type="checkbox"
                    checked={enableUfls}
                    onChange={(e) => setEnableUfls(e.target.checked)}
                    className="rounded accent-[#500b50]"
                  />
                  <span>NERC UFLS Defense (4 Stages)</span>
                </label>
                <span className="text-[10px] text-slate-400 mt-1 block">Stage 1 triggers at 48.80 Hz</span>
              </div>
            </div>
          </div>

          {/* Metric KPI Cards */}
          {dynResult && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs uppercase font-bold text-slate-400 block">Frequency Nadir</span>
                <span className={`text-2xl font-black font-mono ${nadirVal < 48.80 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {nadirVal.toFixed(2)} Hz
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">NERC Statutory Band: ≥ 48.80 Hz</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs uppercase font-bold text-slate-400 block">Initial RoCoF (df/dt)</span>
                <span className="text-2xl font-black font-mono text-purple-900">
                  {rocofVal.toFixed(2)} Hz/s
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">Grid Code Limit: ≤ -0.50 Hz/s</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs uppercase font-bold text-slate-400 block">Settling Frequency</span>
                <span className="text-2xl font-black font-mono text-slate-900">
                  {settlingVal.toFixed(2)} Hz
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">Target: 49.75 – 50.25 Hz</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span className="text-xs uppercase font-bold text-slate-400 block">Automatic Load Shed</span>
                <span className="text-2xl font-black font-mono text-amber-600">
                  {totalShedVal} MW
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">{stagesTrippedVal} of 4 Stages Tripped</span>
              </div>
            </div>
          )}

          {/* Center-of-Inertia Frequency Graph with Direct Export */}
          <div className="rounded-2xl border border-slate-800 bg-[#0a0d14] p-5 shadow-xl text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></div>
                <h3 className="text-sm font-bold text-slate-100 tracking-wide">
                  Center-of-Inertia Frequency Response: $f(t)$
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportAsPNG(freqSvgRef, 'NESI_Frequency_Response')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                  title="Export PNG"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
                  <span>PNG</span>
                </button>

                <button
                  onClick={() => exportAsSVG(freqSvgRef, 'NESI_Frequency_Response')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                  title="Export SVG"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span>SVG</span>
                </button>

                <button
                  onClick={exportFrequencyCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                  title="Export CSV"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-amber-400" />
                  <span>CSV Data</span>
                </button>
              </div>
            </div>

            <div className="relative mt-4 overflow-x-auto">
              {dynResult ? (
                <svg
                  ref={freqSvgRef}
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-auto min-w-[750px] overflow-visible select-none"
                >
                  {[46.0, 47.0, 48.0, 48.8, 49.75, 50.0].map((fVal) => {
                    const y = mapFreqY(fVal);
                    const isUfls = fVal === 48.8;
                    const isNominal = fVal === 50.0;
                    return (
                      <g key={fVal}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={svgWidth - padRight}
                          y2={y}
                          stroke={isUfls ? '#f43f5e' : isNominal ? '#10b981' : '#1e293b'}
                          strokeWidth={isUfls || isNominal ? 1.5 : 1}
                          strokeDasharray={isUfls ? '4 4' : undefined}
                        />
                        <text
                          x={padLeft - 10}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill={isUfls ? '#f43f5e' : isNominal ? '#10b981' : '#64748b'}
                          fontFamily="monospace"
                        >
                          {fVal.toFixed(2)} Hz
                        </text>
                      </g>
                    );
                  })}

                  {[0, 2, 4, 6, 8, 10, 12].map((tVal) => {
                    const x = mapX(tVal, 12.0);
                    return (
                      <g key={tVal}>
                        <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} stroke="#1e293b" strokeWidth="1" />
                        <text
                          x={x}
                          y={svgHeight - padBottom + 18}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748b"
                          fontFamily="monospace"
                        >
                          {tVal}s
                        </text>
                      </g>
                    );
                  })}

                  {unmitigatedSeries.length > 0 && (
                    <path
                      d={dynResult.time.reduce(
                        (acc, t, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${mapX(t, 12.0)} ${mapFreqY(unmitigatedSeries[i] ?? 50.0)}`,
                        ''
                      )}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeDasharray="6 4"
                    />
                  )}

                  {protectedSeries.length > 0 && (
                    <path
                      d={dynResult.time.reduce(
                        (acc, t, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${mapX(t, 12.0)} ${mapFreqY(protectedSeries[i] ?? 50.0)}`,
                        ''
                      )}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                    />
                  )}

                  {uflsEvents.map((ev, idx) => {
                    const tVal: number = Number(ev.timestamp ?? (ev as any).timestamp_s ?? 0);
                    const threshVal: number = Number(ev.threshold_hz ?? (ev as any).frequency_at_trip ?? 48.8);
                    const shedVal: number = Number(ev.shed_mw ?? (ev as any).mw_shed ?? 0);
                    const cx = mapX(tVal, 12.0);
                    const cy = mapFreqY(threshVal);

                    return (
                      <g key={idx}>
                        <circle cx={cx} cy={cy} r="5" fill="#f43f5e" stroke="#ffffff" strokeWidth="2" />
                        <text
                          x={cx + 8}
                          y={cy - 6}
                          fontSize="9"
                          fill="#fda4af"
                          fontFamily="sans-serif"
                          fontWeight="bold"
                        >
                          Stage {ev.stage} (-{shedVal}MW)
                        </text>
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Click &quot;Simulate Dynamic Transient&quot; above to calculate frequency response.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-6">
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-6 bg-[#10b981]"></span>
                  <span>UFLS & Governor Protected</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-6 bg-[#ef4444] border-b border-dashed border-red-400"></span>
                  <span>Unmitigated Trajectory</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#f43f5e]"></span>
                  <span>UFLS Relay Tripping Events</span>
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">Center-of-Inertia Vector Plot (0 to 12s)</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: MULTI-MACHINE ROTOR ANGLES & CCT                                   */}
      {/* ========================================================================= */}
      {subView === 'multimachine' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  1. Fault Location (Substation Bus)
                </label>
                <select
                  value={faultBus}
                  onChange={(e) => setFaultBus(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      #{b.id} {b.name} ({b.vn_kv || 330} kV)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase text-slate-600">
                    2. Breaker Clearing Duration (t_clear)
                  </label>
                  <span className="font-mono font-bold text-[#500b50] text-sm">
                    {breakerDuration} ms ({(breakerDuration / 20.0).toFixed(1)} cycles)
                  </span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="300"
                  step="5"
                  value={breakerDuration}
                  onChange={(e) => setBreakerDuration(Number(e.target.value))}
                  className="w-full accent-[#500b50] cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1">
                  <span>20 ms (1 cycle)</span>
                  <span>80 ms (4 cycles)</span>
                  <span>150 ms (Statutory)</span>
                  <span>300 ms</span>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleSimulateMultiMachine}
                  disabled={mmLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#500b50] text-white py-2.5 text-sm font-bold hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
                >
                  {mmLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span>Run Multi-Machine Analysis</span>
                </button>
              </div>
            </div>
          </div>

          {mmResult && (
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                mmResult.system_status === 'POLE_SLIP'
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
              }`}
            >
              <div className="flex items-center gap-3">
                {mmResult.system_status === 'POLE_SLIP' ? (
                  <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0" />
                ) : (
                  <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" />
                )}
                <div>
                  <h4 className="font-bold text-sm">
                    {mmResult.system_status === 'POLE_SLIP'
                      ? 'TRANSIENT INSTABILITY: Machine POLE SLIP'
                      : 'SYNCHRONOUS STABILITY MAINTAINED'}
                  </h4>
                  <p className="text-xs opacity-90">
                    Fault at Bus #{faultBus} cleared in {breakerDuration} ms. {mmResult.trajectories.length} generating units monitored.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider block opacity-70">
                  Critical Clearing Time
                </span>
                <span className="font-mono text-base font-black">
                  {mmResult.lowest_cct_ms} ms ({(mmResult.lowest_cct_ms / 20.0).toFixed(1)} cycles)
                </span>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-[#0a0d14] p-5 shadow-xl text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-cyan-400"></div>
                <h3 className="text-sm font-bold text-slate-100 tracking-wide">
                  Generator Rotor Angles Relative to Slack: (δ_i - δ_slack)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportAsPNG(angleSvgRef, 'NESI_MultiMachine_Angles')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                  title="Export PNG"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
                  <span>PNG</span>
                </button>

                <button
                  onClick={() => exportAsSVG(angleSvgRef, 'NESI_MultiMachine_Angles')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                  title="Export SVG"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span>SVG</span>
                </button>

                <button
                  onClick={exportAngleCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                  title="Export CSV"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-amber-400" />
                  <span>CSV Data</span>
                </button>
              </div>
            </div>

            <div className="relative mt-4 overflow-x-auto">
              {mmResult ? (
                <svg
                  ref={angleSvgRef}
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-auto min-w-[750px] overflow-visible select-none"
                >
                  {[0, 45, 90, 135, 180].map((degVal) => {
                    const y = mapAngleY(degVal);
                    const isLimit = degVal === 180;
                    const isSlack = degVal === 0;
                    return (
                      <g key={degVal}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={svgWidth - padRight}
                          y2={y}
                          stroke={isLimit ? '#f43f5e' : isSlack ? '#94a3b8' : '#1e293b'}
                          strokeWidth={isLimit || isSlack ? 1.5 : 1}
                          strokeDasharray={isLimit ? '4 4' : undefined}
                        />
                        <text
                          x={padLeft - 10}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill={isLimit ? '#f43f5e' : '#64748b'}
                          fontFamily="monospace"
                        >
                          {degVal}° {isLimit ? '(Pole Slip)' : isSlack ? '(Slack)' : ''}
                        </text>
                      </g>
                    );
                  })}

                  {[0, 1.0, 2.0, 3.0, 4.0].map((tVal) => {
                    const x = mapX(tVal, 4.0);
                    return (
                      <g key={tVal}>
                        <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} stroke="#1e293b" strokeWidth="1" />
                        <text
                          x={x}
                          y={svgHeight - padBottom + 18}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748b"
                          fontFamily="monospace"
                        >
                          {tVal.toFixed(1)}s
                        </text>
                      </g>
                    );
                  })}

                  {mmResult.fault_start_s && (
                    <rect
                      x={mapX(mmResult.fault_start_s, 4.0)}
                      y={padTop}
                      width={mapX(mmResult.fault_clear_s, 4.0) - mapX(mmResult.fault_start_s, 4.0)}
                      height={svgHeight - padTop - padBottom}
                      fill="#eab308"
                      fillOpacity="0.25"
                      stroke="#eab308"
                      strokeWidth="1"
                    />
                  )}

                  {mmResult.fault_start_s && (
                    <text
                      x={mapX(mmResult.fault_start_s, 4.0) + 4}
                      y={padTop + 14}
                      fontSize="9"
                      fill="#fef08a"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      FAULT ({breakerDuration}ms)
                    </text>
                  )}

                  {mmResult.trajectories.map((gen: any, idx: number) => {
                    const color = MACHINE_COLORS[idx % MACHINE_COLORS.length];
                    const pathData = mmResult.time.reduce(
                      (acc: string, t: number, i: number) =>
                        `${acc} ${i === 0 ? 'M' : 'L'} ${mapX(t, 4.0)} ${mapAngleY(gen.angles[i])}`,
                      ''
                    );

                    return (
                      <path
                        key={gen.id}
                        d={pathData}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeOpacity="0.85"
                      />
                    );
                  })}
                </svg>
              ) : (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Click &quot;Run Multi-Machine Analysis&quot; to compute dynamic rotor angles.
                </div>
              )}
            </div>

            {mmResult && (
              <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap gap-4 text-xs">
                {mmResult.trajectories.map((gen: any, idx: number) => (
                  <span key={gen.id} className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: MACHINE_COLORS[idx % MACHINE_COLORS.length] }}
                    ></span>
                    <span>{gen.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {mmResult && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                <span>Generating Plant Inertia & Transient Angular Excursions</span>
                <span className="font-normal text-xs text-white/80">Statutory Primary Clearance: ≤ 150 ms (7.5 cycles)</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[700px]">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Generating Station</th>
                      <th className="py-3 px-4">Bus Node</th>
                      <th className="py-3 px-4">Inertia (H)</th>
                      <th className="py-3 px-4">Max Excursion</th>
                      <th className="py-3 px-4">Plant CCT Limit</th>
                      <th className="py-3 px-4">CCT Margin</th>
                      <th className="py-3 px-4 text-right">Transient Coherence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {mmResult.machines.map((m: any, idx: number) => {
                      const isSlipped = m.status === 'POLE SLIP';
                      const marginPositive = m.cct_margin_ms >= 0;

                      return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: MACHINE_COLORS[idx % MACHINE_COLORS.length] }}
                            ></span>
                            <span>{m.name}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">{m.bus_node}</td>
                          <td className="py-3 px-4 font-mono">{m.inertia_h}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">{m.max_excursion}</td>
                          <td className="py-3 px-4 font-mono font-bold text-purple-900">{m.cct_ms} ms</td>
                          <td className="py-3 px-4 font-mono font-bold">
                            <span className={marginPositive ? 'text-emerald-700' : 'text-rose-600'}>
                              {marginPositive ? `+${m.cct_margin_ms} ms (Stable)` : `${m.cct_margin_ms} ms (Deficit)`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold ${
                                isSlipped ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};