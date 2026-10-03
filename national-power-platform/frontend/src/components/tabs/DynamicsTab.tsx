'use client';

import React, { useState, useRef, useMemo } from 'react';
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
  Search,
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
  onRunMultiMachine?: (params: { fault_bus_id: number; fault_duration_ms: number }) => Promise<any>;
}

export const DynamicsTab: React.FC<Props> = ({
  dynResult,
  dynLoading,
  onRunSimulation,
  buses = [],
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

  // Interactive Hover Inspection States
  const [hoveredFreqTime, setHoveredFreqTime] = useState<number | null>(null);
  const [hoveredMmTime, setHoveredMmTime] = useState<number | null>(null);
  const [hoveredGenId, setHoveredGenId] = useState<number | string | null>(null);
  const [genSearchQuery, setGenSearchQuery] = useState('');

  // SVG Canvas Refs for High-Res White Image Export
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

  // SVG Geometry Dimensions
  const svgWidth = 920;
  const svgHeight = 310;
  const padLeft = 95; // Increased to prevent axis text clipping
  const padRight = 35;
  const padTop = 35;
  const padBottom = 45;

  const mapX = (t: number, maxT: number) =>
    padLeft + (t / maxT) * (svgWidth - padLeft - padRight);

  const mapFreqY = (f: number) => {
    const minF = 45.5;
    const maxF = 50.5;
    const clamped = Math.max(minF, Math.min(maxF, f));
    return padTop + ((maxF - clamped) / (maxF - minF)) * (svgHeight - padTop - padBottom);
  };

  const mapAngleY = (deg: number) => {
    const minDeg = -20.0;
    const maxDeg = 200.0;
    const clamped = Math.max(minDeg, Math.min(maxDeg, deg));
    return padTop + ((maxDeg - clamped) / (maxDeg - minDeg)) * (svgHeight - padTop - padBottom);
  };

  // High-Contrast Technical Palette
  const MACHINE_COLORS = [
    '#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed',
    '#ea580c', '#0d9488', '#db2777', '#2563eb', '#9333ea',
    '#16a34a', '#b45309', '#4f46e5', '#0891b2', '#c026d3',
  ];

  // Frequency Hover Inspector Lookup
  const freqHoverData = useMemo(() => {
    if (hoveredFreqTime === null || !dynResult || dynResult.time.length === 0) return null;
    let closestIdx = 0;
    let minDiff = Infinity;
    dynResult.time.forEach((t, i) => {
      const diff = Math.abs(t - hoveredFreqTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    const time = dynResult.time[closestIdx];
    const fProt = protectedSeries[closestIdx] ?? 50.0;
    const fUnmit = unmitigatedSeries[closestIdx] ?? 50.0;

    return {
      time,
      fProt,
      fUnmit,
      x: mapX(time, 12.0),
      yProt: mapFreqY(fProt),
      yUnmit: mapFreqY(fUnmit),
    };
  }, [hoveredFreqTime, dynResult, protectedSeries, unmitigatedSeries]);

  // Multi-Machine Hover Inspector Lookup
  const mmHoverData = useMemo(() => {
    if (hoveredMmTime === null || !mmResult || !mmResult.time || mmResult.time.length === 0) return null;
    let closestIdx = 0;
    let minDiff = Infinity;
    mmResult.time.forEach((t: number, i: number) => {
      const diff = Math.abs(t - hoveredMmTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    const time = mmResult.time[closestIdx];
    const machineAngles = mmResult.trajectories.map((traj: any, idx: number) => ({
      id: traj.id,
      name: traj.name,
      angle: traj.angles[closestIdx] ?? 0.0,
      color: MACHINE_COLORS[idx % MACHINE_COLORS.length],
    }));

    return {
      time,
      x: mapX(time, 4.0),
      machineAngles,
    };
  }, [hoveredMmTime, mmResult]);

  // Export Graph as PNG with Clear White Canvas
  const exportAsPNG = (svgRef: React.RefObject<SVGSVGElement | null>, filename: string) => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
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

  // Export Graph as Vector SVG
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

  // Export CSV Telemetry
  const exportFrequencyCSV = () => {
    if (!dynResult) return;
    let csv = 'Time_s,Protected_Frequency_Hz,Unmitigated_Frequency_Hz\n';
    dynResult.time.forEach((t, i) => {
      csv += `${t},${protectedSeries[i] ?? ''},${unmitigatedSeries[i] ?? ''}\n`;
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
    a.download = 'NESI_MultiMachine_Rotor_Angles.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-2">
      {/* Top Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Dynamic Stability &amp; Transient Security Studio
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-[#500b50] border border-purple-200">
              Time-Domain Vector CAD
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Lumped center-of-inertia frequency response, UFLS defense, and multi-machine rotor angle transient trajectories.
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-xs">
          <button
            onClick={() => setSubView('lumped')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              subView === 'lumped' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Lumped Frequency &amp; UFLS</span>
          </button>

          <button
            onClick={() => {
              setSubView('multimachine');
              if (!mmResult) handleSimulateMultiMachine();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              subView === 'multimachine' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Multi-Machine Angles &amp; CCT</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: LUMPED FREQUENCY RESPONSE                                         */}
      {/* ========================================================================= */}
      {subView === 'lumped' && (
        <div className="space-y-6">
          {/* Controls Deck */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Disturbance &amp; Control Parameters
              </span>
              <button
                onClick={handleSimulateLumped}
                disabled={dynLoading}
                className="flex items-center gap-2 rounded-xl bg-[#500b50] px-5 py-2 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
              >
                {dynLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span>Simulate Transient Response</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
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
                    className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:border-[#500b50] focus:outline-none"
                  />
                  <span className="text-xs text-slate-500 font-mono font-bold">MW</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
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
                    className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:border-[#500b50] focus:outline-none"
                  />
                  <span className="text-xs text-slate-500 font-mono font-bold">s</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Governor Droop (R)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.02"
                  max="0.10"
                  value={droopR}
                  onChange={(e) => setDroopR(parseFloat(e.target.value) || 0.05)}
                  className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:border-[#500b50] focus:outline-none"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  PSS Gain (K_pss)
                </label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="50"
                  value={pssGain}
                  onChange={(e) => setPssGain(parseFloat(e.target.value) || 25)}
                  className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:border-[#500b50] focus:outline-none"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-center space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={enableGov}
                    onChange={(e) => setEnableGov(e.target.checked)}
                    className="rounded accent-[#500b50]"
                  />
                  <span>Turbine Governor</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={enablePss}
                    onChange={(e) => setEnablePss(e.target.checked)}
                    className="rounded accent-[#500b50]"
                  />
                  <span>PSS Damping</span>
                </label>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#500b50]">
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
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Frequency Nadir
                </span>
                <span className={`text-2xl font-black font-mono ${nadirVal < 48.80 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {nadirVal.toFixed(2)} Hz
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Statutory Limit: ≥ 48.80 Hz</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Initial RoCoF (df/dt)
                </span>
                <span className="text-2xl font-black font-mono text-[#500b50]">
                  {rocofVal.toFixed(2)} Hz/s
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Grid Code Limit: ≤ -0.50 Hz/s</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Settling Frequency
                </span>
                <span className="text-2xl font-black font-mono text-slate-900">
                  {settlingVal.toFixed(2)} Hz
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Target: 49.75 – 50.25 Hz</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Automatic Load Shed
                </span>
                <span className="text-2xl font-black font-mono text-amber-600">
                  {totalShedVal} MW
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">{stagesTrippedVal} of 4 Stages Tripped</span>
              </div>
            </div>
          )}

          {/* Center-of-Inertia Frequency Graph (Clear White CAD Surface) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full bg-emerald-600 animate-pulse"></div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Center-of-Inertia Frequency Response: $f(t)$
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportAsPNG(freqSvgRef, 'NESI_Frequency_Response')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                  title="Export PNG"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-600" />
                  <span>PNG</span>
                </button>

                <button
                  onClick={() => exportAsSVG(freqSvgRef, 'NESI_Frequency_Response')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                  title="Export SVG"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>SVG</span>
                </button>

                <button
                  onClick={exportFrequencyCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                  title="Export CSV"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <div className="relative mt-4 overflow-x-auto select-none">
              {dynResult ? (
                <div className="relative">
                  <svg
                    ref={freqSvgRef}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="w-full h-auto min-w-[800px] overflow-visible"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;
                      if (mouseX >= padLeft && mouseX <= svgWidth - padRight) {
                        const t = ((mouseX - padLeft) / (svgWidth - padLeft - padRight)) * 12.0;
                        setHoveredFreqTime(Math.max(0, Math.min(12.0, t)));
                      }
                    }}
                    onMouseLeave={() => setHoveredFreqTime(null)}
                  >
                    {/* Clear White Canvas Background */}
                    <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="#ffffff" />

                    {/* Statutory Normal Frequency Band Shading (49.75 Hz to 50.25 Hz) */}
                    <rect
                      x={padLeft}
                      y={mapFreqY(50.25)}
                      width={svgWidth - padLeft - padRight}
                      height={mapFreqY(49.75) - mapFreqY(50.25)}
                      fill="#10b981"
                      fillOpacity="0.08"
                    />

                    {/* Horizontal Voltage & Frequency Gridlines */}
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
                            stroke={isUfls ? '#f43f5e' : isNominal ? '#059669' : '#e2e8f0'}
                            strokeWidth={isUfls || isNominal ? 1.5 : 1}
                            strokeDasharray={isUfls ? '4 4' : undefined}
                          />
                          <text
                            x={padLeft - 10}
                            y={y + 4}
                            textAnchor="end"
                            fontSize="10"
                            fill={isUfls ? '#e11d48' : isNominal ? '#059669' : '#64748b'}
                            fontFamily="monospace"
                            fontWeight={isUfls || isNominal ? 'bold' : 'normal'}
                          >
                            {fVal.toFixed(2)} Hz
                          </text>
                        </g>
                      );
                    })}

                    {/* Time Gridlines (0s to 12s) */}
                    {[0, 2, 4, 6, 8, 10, 12].map((tVal) => {
                      const x = mapX(tVal, 12.0);
                      return (
                        <g key={tVal}>
                          <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} stroke="#e2e8f0" strokeWidth="1" />
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

                    {/* Unmitigated Frequency Curve */}
                    {unmitigatedSeries.length > 0 && (
                      <path
                        d={dynResult.time.reduce(
                          (acc, t, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${mapX(t, 12.0)} ${mapFreqY(unmitigatedSeries[i] ?? 50.0)}`,
                          ''
                        )}
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                      />
                    )}

                    {/* Protected Frequency Curve */}
                    {protectedSeries.length > 0 && (
                      <path
                        d={dynResult.time.reduce(
                          (acc, t, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${mapX(t, 12.0)} ${mapFreqY(protectedSeries[i] ?? 50.0)}`,
                          ''
                        )}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="3"
                      />
                    )}

                    {/* UFLS Breaker Tripping Events */}
                    {uflsEvents.map((ev, idx) => {
                      const tVal = Number(ev.timestamp ?? (ev as any).timestamp_s ?? 0);
                      const thresh = Number(ev.threshold_hz ?? (ev as any).frequency_at_trip ?? 48.8);
                      const shedMw = Number(ev.shed_mw ?? (ev as any).mw_shed ?? 0);
                      const cx = mapX(tVal, 12.0);
                      const cy = mapFreqY(thresh);

                      return (
                        <g key={idx}>
                          <circle cx={cx} cy={cy} r="5" fill="#e11d48" stroke="#ffffff" strokeWidth="2" />
                          <rect
                            x={cx + 7}
                            y={cy - 16}
                            width="90"
                            height="16"
                            rx="3"
                            fill="#ffffff"
                            stroke="#f43f5e"
                            strokeWidth="1"
                          />
                          <text
                            x={cx + 12}
                            y={cy - 4}
                            fontSize="9"
                            fill="#be123c"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            Stage {ev.stage} (-{shedMw}MW)
                          </text>
                        </g>
                      );
                    })}

                    {/* Live Hover Crosshair Indicator */}
                    {freqHoverData && (
                      <g pointerEvents="none">
                        <line
                          x1={freqHoverData.x}
                          y1={padTop}
                          x2={freqHoverData.x}
                          y2={svgHeight - padBottom}
                          stroke="#64748b"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                        <circle cx={freqHoverData.x} cy={freqHoverData.yProt} r="5" fill="#059669" stroke="#ffffff" strokeWidth="2" />
                        <circle cx={freqHoverData.x} cy={freqHoverData.yUnmit} r="4" fill="#dc2626" stroke="#ffffff" strokeWidth="2" />
                      </g>
                    )}
                  </svg>

                  {/* Floating Telemetry Inspector Tooltip */}
                  {freqHoverData && (
                    <div
                      className="absolute z-20 pointer-events-none rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-xl p-3 text-xs font-mono space-y-1"
                      style={{
                        left: `${Math.min(75, Math.max(12, (freqHoverData.x / svgWidth) * 100))}%`,
                        top: '15px',
                      }}
                    >
                      <span className="font-bold text-slate-800 block border-b pb-1">
                        t = {freqHoverData.time.toFixed(2)}s Telemetry
                      </span>
                      <div className="flex items-center justify-between gap-4 text-emerald-700 font-bold">
                        <span>Protected:</span>
                        <span>{freqHoverData.fProt.toFixed(3)} Hz</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-rose-600">
                        <span>Unmitigated:</span>
                        <span>{freqHoverData.fUnmit.toFixed(3)} Hz</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-slate-500 text-[10px]">
                        <span>Δf from Nominal:</span>
                        <span>{(freqHoverData.fProt - 50.0).toFixed(3)} Hz</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400 text-xs">
                  Click &quot;Simulate Transient Response&quot; to calculate dynamic frequency trajectory.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-6">
                <span className="flex items-center gap-2">
                  <span className="h-1 w-6 bg-[#059669] rounded-full"></span>
                  <span className="font-medium text-slate-700">Protected Trajectory</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-6 bg-[#dc2626] border-b border-dashed border-red-500"></span>
                  <span className="font-medium text-slate-700">Unmitigated Trajectory</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#e11d48]"></span>
                  <span className="font-medium text-slate-700">UFLS Tripping Stages</span>
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">Move cursor over plot to inspect live values</span>
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
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white focus:border-[#500b50] focus:outline-none"
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
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>20 ms (1c)</span>
                  <span>80 ms (4c)</span>
                  <span>150 ms (Statutory)</span>
                  <span>300 ms</span>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleSimulateMultiMachine}
                  disabled={mmLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#500b50] text-white py-2.5 text-xs font-bold hover:bg-[#680f68] transition shadow-xs disabled:opacity-50"
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
                      ? 'TRANSIENT INSTABILITY: Generator Pole Slip Detected'
                      : 'SYNCHRONOUS STABILITY MAINTAINED'}
                  </h4>
                  <p className="text-xs opacity-90">
                    Symmetrical three-phase fault at Bus #{faultBus} cleared in {breakerDuration} ms. {mmResult.trajectories.length} generating units monitored.
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

          {/* Rotor Angle Graph (Clear White CAD Surface) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full bg-cyan-600"></div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Generator Rotor Angles Relative to Slack: (δ_i - δ_slack)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportAsPNG(angleSvgRef, 'NESI_MultiMachine_Angles')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                  title="Export PNG"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-600" />
                  <span>PNG</span>
                </button>

                <button
                  onClick={() => exportAsSVG(angleSvgRef, 'NESI_MultiMachine_Angles')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                  title="Export SVG"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>SVG</span>
                </button>

                <button
                  onClick={exportAngleCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                  title="Export CSV"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <div className="relative mt-4 overflow-x-auto select-none">
              {mmResult ? (
                <div className="relative">
                  <svg
                    ref={angleSvgRef}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="w-full h-auto min-w-[800px] overflow-visible"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;
                      if (mouseX >= padLeft && mouseX <= svgWidth - padRight) {
                        const t = ((mouseX - padLeft) / (svgWidth - padLeft - padRight)) * 4.0;
                        setHoveredMmTime(Math.max(0, Math.min(4.0, t)));
                      }
                    }}
                    onMouseLeave={() => setHoveredMmTime(null)}
                  >
                    {/* Clear White Canvas Background */}
                    <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="#ffffff" />

                    {/* Horizontal Angle Gridlines */}
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
                            stroke={isLimit ? '#dc2626' : isSlack ? '#64748b' : '#e2e8f0'}
                            strokeWidth={isLimit || isSlack ? 1.5 : 1}
                            strokeDasharray={isLimit ? '4 4' : undefined}
                          />
                          <text
                            x={padLeft - 10}
                            y={y + 4}
                            textAnchor="end"
                            fontSize="10"
                            fill={isLimit ? '#dc2626' : isSlack ? '#334155' : '#64748b'}
                            fontFamily="monospace"
                            fontWeight={isLimit || isSlack ? 'bold' : 'normal'}
                          >
                            {degVal}° {isLimit ? '(Pole Slip)' : isSlack ? '(Slack)' : ''}
                          </text>
                        </g>
                      );
                    })}

                    {/* Time Gridlines (0s to 4.0s) */}
                    {[0, 1.0, 2.0, 3.0, 4.0].map((tVal) => {
                      const x = mapX(tVal, 4.0);
                      return (
                        <g key={tVal}>
                          <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} stroke="#e2e8f0" strokeWidth="1" />
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

                    {/* Symmetrical Fault Region (Yellow Translucent Column) */}
                    {mmResult.fault_start_s && (
                      <rect
                        x={mapX(mmResult.fault_start_s, 4.0)}
                        y={padTop}
                        width={Math.max(6, mapX(mmResult.fault_clear_s, 4.0) - mapX(mmResult.fault_start_s, 4.0))}
                        height={svgHeight - padTop - padBottom}
                        fill="#fef08a"
                        fillOpacity="0.45"
                        stroke="#eab308"
                        strokeWidth="1.2"
                      />
                    )}

                    {mmResult.fault_start_s && (
                      <text
                        x={mapX(mmResult.fault_start_s, 4.0) + 4}
                        y={padTop + 14}
                        fontSize="9"
                        fill="#854d0e"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        FAULT ({breakerDuration}ms)
                      </text>
                    )}

                    {/* Generator Dynamic Trajectories with Hover Isolation */}
                    {mmResult.trajectories.map((gen: any, idx: number) => {
                      const color = MACHINE_COLORS[idx % MACHINE_COLORS.length];
                      const isHovered = hoveredGenId === gen.id;
                      const hasActiveHover = hoveredGenId !== null;

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
                          strokeWidth={isHovered ? 3.5 : 2}
                          strokeOpacity={hasActiveHover ? (isHovered ? 1.0 : 0.15) : 0.85}
                          className="transition-all duration-150"
                        />
                      );
                    })}

                    {/* Live Hover Crosshair Indicator */}
                    {mmHoverData && (
                      <g pointerEvents="none">
                        <line
                          x1={mmHoverData.x}
                          y1={padTop}
                          x2={mmHoverData.x}
                          y2={svgHeight - padBottom}
                          stroke="#64748b"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                      </g>
                    )}
                  </svg>

                  {/* Multi-Machine Live Inspection Tooltip */}
                  {mmHoverData && (
                    <div
                      className="absolute z-20 pointer-events-none rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-xl p-3 text-xs font-mono space-y-1.5 max-h-48 overflow-y-auto"
                      style={{
                        left: `${Math.min(75, Math.max(12, (mmHoverData.x / svgWidth) * 100))}%`,
                        top: '15px',
                      }}
                    >
                      <span className="font-bold text-slate-800 block border-b pb-1">
                        t = {mmHoverData.time.toFixed(2)}s Angular State
                      </span>
                      {mmHoverData.machineAngles.slice(0, 5).map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 text-[11px]">
                          <span className="flex items-center gap-1.5 truncate max-w-[120px]">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color }}></span>
                            <span className="truncate">{m.name}</span>
                          </span>
                          <span className="font-bold">{m.angle.toFixed(1)}°</span>
                        </div>
                      ))}
                      {mmHoverData.machineAngles.length > 5 && (
                        <span className="text-[10px] text-slate-400 block pt-0.5">
                          +{mmHoverData.machineAngles.length - 5} more machines
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400 text-xs">
                  Click &quot;Run Multi-Machine Analysis&quot; to calculate generator dynamic rotor angles.
                </div>
              )}
            </div>

            {/* Interactive Generator Legend with Quick Filter */}
            {mmResult && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Generating Units Monitored ({mmResult.trajectories.length})
                  </span>
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter plant name..."
                      value={genSearchQuery}
                      onChange={(e) => setGenSearchQuery(e.target.value)}
                      className="pl-7 pr-2.5 py-1 text-[11px] border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-[#500b50] w-40"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1">
                  {mmResult.trajectories
                    .filter((g: any) => g.name.toLowerCase().includes(genSearchQuery.toLowerCase()))
                    .map((gen: any, idx: number) => {
                      const isHovered = hoveredGenId === gen.id;
                      const color = MACHINE_COLORS[idx % MACHINE_COLORS.length];

                      return (
                        <button
                          key={gen.id}
                          onMouseEnter={() => setHoveredGenId(gen.id)}
                          onMouseLeave={() => setHoveredGenId(null)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition ${
                            isHovered
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }}></span>
                          <span className="font-semibold">{gen.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Plant CCT Data Table */}
          {mmResult && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
                <span>Generating Plant Inertia &amp; Transient Angular Excursions</span>
                <span className="font-normal text-xs text-white/80">Statutory Primary Clearance: ≤ 150 ms (7.5 cycles)</span>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-sm min-w-[700px]">
                  <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold sticky top-0 text-xs uppercase tracking-wider">
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
                  <tbody className="divide-y divide-slate-100 text-slate-800 text-xs">
                    {mmResult.machines.map((m: any, idx: number) => {
                      const isSlipped = m.status === 'POLE SLIP';
                      const marginPositive = m.cct_margin_ms >= 0;

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: MACHINE_COLORS[idx % MACHINE_COLORS.length] }}
                            ></span>
                            <span>{m.name}</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">{m.bus_node}</td>
                          <td className="py-2.5 px-4 font-mono">{m.inertia_h}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-800">{m.max_excursion}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-[#500b50]">{m.cct_ms} ms</td>
                          <td className="py-2.5 px-4 font-mono font-bold">
                            <span className={marginPositive ? 'text-emerald-700' : 'text-rose-600'}>
                              {marginPositive ? `+${m.cct_margin_ms} ms (Stable)` : `${m.cct_margin_ms} ms (Deficit)`}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
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