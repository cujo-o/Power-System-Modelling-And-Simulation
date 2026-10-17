'use client';

import React, { useState, useEffect } from 'react';
import { BusData, DynamicSimResult } from '@/types/grid';
import { Activity, RefreshCw } from 'lucide-react';

export interface DynamicsTabProps {
  buses?: BusData[];
  modelName?: string;
  dynResult?: DynamicSimResult | any | null;
  dynLoading?: boolean;
  onRunSimulation?: (params: {
    disturbance_mw: number;
    inertia_constant_H: number;
    enable_governor: boolean;
    droop_R: number;
    enable_pss: boolean;
    pss_gain_K: number;
    enable_ufls: boolean;
  }) => Promise<any> | void;
  onRunMultiMachine?: (params: {
    fault_bus_id: number;
    fault_duration_ms: number;
    calc_cct?: boolean;
  }) => Promise<any> | void;
}

const TooltipBadge: React.FC<{ content: string }> = ({ content }) => (
  <span className="relative group inline-flex items-center ml-1 align-baseline cursor-help">
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-[#500b50] hover:text-white transition">
      ?
    </span>
    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-56 rounded-lg bg-slate-900 p-2 text-[11px] font-normal normal-case leading-snug text-white shadow-xl z-50 text-center">
      {content}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
    </span>
  </span>
);

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

export const DynamicsTab: React.FC<DynamicsTabProps> = ({
  buses = [],
  modelName = '',
  dynResult,
  dynLoading = false,
  onRunSimulation,
  onRunMultiMachine,
}) => {
  const [subTab, setSubTab] = useState<'frequency' | 'multimachine'>('frequency');

  // Frequency Stability State
  const [disturbanceMw, setDisturbanceMw] = useState<number>(450);
  const [inertiaH, setInertiaH] = useState<number>(4.5);
  const [droopR, setDroopR] = useState<number>(0.05);
  const [pssGainK, setPssGainK] = useState<number>(25);
  const [enableGovernor, setEnableGovernor] = useState<boolean>(true);
  const [enablePss, setEnablePss] = useState<boolean>(true);
  const [enableUfls, setEnableUfls] = useState<boolean>(true);
  const [localFreqLoading, setLocalFreqLoading] = useState<boolean>(false);
  const [localFreqResult, setLocalFreqResult] = useState<any>(null);

  // Multi-Machine Rotor Angle State
  const [faultBusId, setFaultBusId] = useState<number>(buses[0]?.id || 1);
  const [faultDurationMs, setFaultDurationMs] = useState<number>(80);
  const [mmLoading, setMmLoading] = useState<boolean>(false);
  const [mmResult, setMmResult] = useState<any>(null);

  useEffect(() => {
    if (buses.length > 0 && !buses.some((b) => b.id === faultBusId)) {
      setFaultBusId(buses[0].id);
    }
  }, [buses, faultBusId]);

  const runFrequencySim = async () => {
    const payload = {
      disturbance_mw: disturbanceMw,
      inertia_constant_H: inertiaH,
      enable_governor: enableGovernor,
      droop_R: droopR,
      enable_pss: enablePss,
      pss_gain_K: pssGainK,
      enable_ufls: enableUfls,
    };

    if (onRunSimulation) {
      await onRunSimulation(payload);
      return;
    }

    setLocalFreqLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulations/dynamics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setLocalFreqResult(await res.json());
      }
    } catch {}
    setLocalFreqLoading(false);
  };

  const runMultiMachineSim = async () => {
    const payload = {
      fault_bus_id: faultBusId,
      fault_duration_ms: faultDurationMs,
      calc_cct: true,
    };

    setMmLoading(true);
    try {
      if (onRunMultiMachine) {
        const res = await onRunMultiMachine(payload);
        if (res) setMmResult(res);
      } else {
        const res = await fetch(`${API_BASE}/api/simulations/multi-machine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setMmResult(await res.json());
        }
      }
    } catch {}
    setMmLoading(false);
  };

  useEffect(() => {
    if (subTab === 'frequency') runFrequencySim();
    else runMultiMachineSim();
  }, [subTab, modelName]);

  const activeFreqResult = dynResult || localFreqResult;
  const isFreqLoading = dynLoading || localFreqLoading;

  const nadirVal =
    activeFreqResult?.nadir_hz ??
    activeFreqResult?.metrics?.nadir_hz ??
    activeFreqResult?.metrics?.nadir ??
    49.2;
  const rocofVal =
    activeFreqResult?.initial_rocof ??
    activeFreqResult?.metrics?.initial_rocof ??
    activeFreqResult?.metrics?.rocof ??
    -0.45;
  const settlingVal =
    activeFreqResult?.settling_hz ??
    activeFreqResult?.metrics?.settling_hz ??
    49.65;
  const shedVal =
    activeFreqResult?.total_shed_mw ??
    activeFreqResult?.metrics?.total_shed_mw ??
    0;
  const stagesTripped =
    activeFreqResult?.stages_tripped ??
    activeFreqResult?.metrics?.stages_tripped ??
    0;

  return (
    <div className="max-w-7xl mx-auto space-y-5 py-1 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Time-Domain Frequency &amp; Transient Rotor Stability
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Simulate system frequency response, Under-Frequency Load Shedding (UFLS), and multi-machine swing equations.
            {modelName && ` Active Model: ${modelName}`}
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold gap-1">
          <button
            onClick={() => setSubTab('frequency')}
            className={`px-3 py-1.5 rounded-lg transition ${
              subTab === 'frequency'
                ? 'bg-[#500b50] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Frequency &amp; UFLS Relays
          </button>
          <button
            onClick={() => setSubTab('multimachine')}
            className={`px-3 py-1.5 rounded-lg transition ${
              subTab === 'multimachine'
                ? 'bg-[#500b50] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Multi-Machine Rotor Angles (CCT)
          </button>
        </div>
      </div>

      {/* SUBTAB 1: FREQUENCY STABILITY & UFLS */}
      {subTab === 'frequency' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <label className="text-[11px] font-bold text-slate-600 flex items-center">
                <span>Generation Trip (MW)</span>
                <TooltipBadge content="Sudden active power deficit (e.g., loss of a major generating station) initiating the frequency drop at t = 0.5 s." />
              </label>
              <input
                type="number"
                step="50"
                min="50"
                max="2000"
                value={disturbanceMw}
                onChange={(e) => setDisturbanceMw(Number(e.target.value) || 450)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <label className="text-[11px] font-bold text-slate-600 flex items-center">
                <span>System Inertia H (s)</span>
                <TooltipBadge content="Aggregate synchronous rotational inertia constant in seconds. Higher inertia slows the initial Rate of Change of Frequency (RoCoF)." />
              </label>
              <input
                type="number"
                step="0.5"
                min="1.5"
                max="10.0"
                value={inertiaH}
                onChange={(e) => setInertiaH(Number(e.target.value) || 4.5)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <label className="text-[11px] font-bold text-slate-600 flex items-center">
                <span>Governor Droop R (pu)</span>
                <TooltipBadge content="Turbine speed governor droop ratio (e.g., 0.05 = 5% droop). Smaller droop produces stronger primary frequency recovery." />
              </label>
              <input
                type="number"
                step="0.01"
                min="0.02"
                max="0.10"
                value={droopR}
                onChange={(e) => setDroopR(Number(e.target.value) || 0.05)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <label className="text-[11px] font-bold text-slate-600 flex items-center">
                <span>PSS Damping Gain K</span>
                <TooltipBadge content="Power System Stabilizer auxiliary damping gain used to suppress low-frequency electromechanical oscillations." />
              </label>
              <input
                type="number"
                step="5"
                min="0"
                max="60"
                value={pssGainK}
                onChange={(e) => setPssGainK(Number(e.target.value) || 25)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center">
                  UFLS Protection
                  <TooltipBadge content="4-stage Under-Frequency Load Shedding relays (48.8 Hz, 48.6 Hz, 48.4 Hz, 48.2 Hz) that trip load feeders to arrest frequency collapse." />
                </span>
                <input
                  type="checkbox"
                  checked={enableUfls}
                  onChange={(e) => setEnableUfls(e.target.checked)}
                  className="accent-[#500b50] h-4 w-4"
                />
              </div>

              <button
                onClick={runFrequencySim}
                disabled={isFreqLoading}
                className="mt-2 w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                {isFreqLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                <span>Run Time-Domain ODE</span>
              </button>
            </div>
          </div>

          {/* KPI Metrics */}
          {activeFreqResult && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
                  <span>Frequency Nadir</span>
                  <TooltipBadge content="Lowest instantaneous frequency reached during the transient disturbance before governor and UFLS recovery." />
                </span>
                <span
                  className={`text-lg font-black mt-0.5 block ${
                    nadirVal < 48.5 ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {nadirVal} Hz
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
                  <span>Initial RoCoF (df/dt)</span>
                  <TooltipBadge content="Rate of Change of Frequency immediately following the disturbance, measured in Hz per second." />
                </span>
                <span className="text-lg font-black text-slate-900 mt-0.5 block">
                  {rocofVal} Hz/s
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
                  <span>Post-Contingency Settling</span>
                  <TooltipBadge content="Quasi-steady-state frequency achieved after primary governor response and UFLS action." />
                </span>
                <span className="text-lg font-black text-[#500b50] mt-0.5 block">
                  {settlingVal} Hz
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
                  <span>UFLS Load Shed</span>
                  <TooltipBadge content="Total megawatts of demand automatically disconnected by under-frequency relays to prevent total blackout." />
                </span>
                <span className="text-lg font-black text-amber-700 mt-0.5 block">
                  {shedVal} MW ({stagesTripped} Stages)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: MULTI-MACHINE ROTOR ANGLES */}
      {subTab === 'multimachine' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <label className="text-[11px] font-bold text-slate-600 flex items-center">
                <span>3-Phase Fault Location</span>
                <TooltipBadge content="Substation busbar where the bolted 3-phase short-circuit fault is applied at t = 1.0 s." />
              </label>
              <select
                value={faultBusId}
                onChange={(e) => setFaultBusId(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-xs bg-slate-50"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id}: {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <label className="text-[11px] font-bold text-slate-600 flex items-center">
                <span>Fault Clearing Time (ms)</span>
                <TooltipBadge content="Duration in milliseconds before circuit breakers open to clear the fault. If clearing time exceeds Critical Clearing Time (CCT), generators lose synchronism (pole slip)." />
              </label>
              <input
                type="number"
                step="10"
                min="20"
                max="350"
                value={faultDurationMs}
                onChange={(e) => setFaultDurationMs(Number(e.target.value) || 80)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-end">
              <button
                onClick={runMultiMachineSim}
                disabled={mmLoading}
                className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                {mmLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                <span>Simulate Rotor Swing</span>
              </button>
            </div>
          </div>

          {mmResult && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Synchronous Machine Rotor Excursion &amp; Critical Clearing Time (CCT)
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                    mmResult.system_status === 'POLE_SLIP'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {mmResult.system_status} • Min CCT: {mmResult.lowest_cct_ms} ms
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Generator</th>
                      <th className="py-2 px-3">Bus Node</th>
                      <th className="py-2 px-3">Inertia (H)</th>
                      <th className="py-2 px-3">Max Rotor Angle</th>
                      <th className="py-2 px-3">Critical Clearing (CCT)</th>
                      <th className="py-2 px-3 text-right">Synchronism</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {(mmResult.machines || []).map((m: any) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-sans font-bold text-slate-900">{m.name}</td>
                        <td className="py-2 px-3 text-slate-500">{m.bus_node}</td>
                        <td className="py-2 px-3">{m.inertia_h}</td>
                        <td className="py-2 px-3 font-bold">{m.max_excursion}</td>
                        <td className="py-2 px-3 text-[#500b50] font-bold">{m.cct_ms} ms</td>
                        <td className="py-2 px-3 text-right font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.status === 'POLE SLIP'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
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