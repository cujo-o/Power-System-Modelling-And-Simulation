'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Activity } from 'lucide-react';
import { TooltipBadge } from '@/components/ui/TooltipBadge';
import { ApiResult, describeNetworkError } from '@/lib/apiClient';
import { GeneratorOverride, LoadSharingResult } from '@/types/grid';

interface LoadSharingPanelProps {
  modelName: string;
  busCount: number;
  generatorOverrides?: Record<number, GeneratorOverride>;
  callWithHydration?: <T = Record<string, unknown>>(
    path: string,
    options?: RequestInit
  ) => Promise<ApiResult<T>>;
}

export const LoadSharingPanel: React.FC<LoadSharingPanelProps> = ({
  modelName,
  busCount,
  generatorOverrides,
  callWithHydration,
}) => {
  const [loadStepMw, setLoadStepMw] = useState<number>(300);
  const [dampingD, setDampingD] = useState<number>(1.2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadSharingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCalculation = useCallback(async () => {
    if (!callWithHydration || busCount === 0) return;
    setLoading(true);
    setError(null);
    try {
      const droopOverrides: Record<string, number> = {};
      if (generatorOverrides) {
        Object.entries(generatorOverrides).forEach(([busId, ovr]) => {
          if (typeof ovr?.droopPercent === 'number' && Number.isFinite(ovr.droopPercent)) {
            droopOverrides[busId] = ovr.droopPercent;
          }
        });
      }

      const res = await callWithHydration<LoadSharingResult>('/api/simulations/load-sharing/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load_step_mw: loadStepMw,
          system_damping_d: dampingD,
          droop_overrides: droopOverrides,
        }),
      });
      if (!res.ok) {
        setError(res.message || `Load-sharing solve returned HTTP ${res.status}.`);
        return;
      }
      setResult(res.body);
    } catch (err) {
      setError(describeNetworkError(err));
    } finally {
      setLoading(false);
    }
  }, [callWithHydration, busCount, generatorOverrides, loadStepMw, dampingD]);

  useEffect(() => {
    if (busCount === 0) return;
    const timer = setTimeout(() => {
      void runCalculation();
    }, 0);
    return () => clearTimeout(timer);
  }, [modelName, busCount, runCalculation]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
              Demand Step (ΔP)
              <TooltipBadge content="Sudden active power load increase allocated across online generators according to their droop slopes." />
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="25"
                min="25"
                max="2000"
                value={loadStepMw}
                onChange={(e) => setLoadStepMw(parseFloat(e.target.value) || 300)}
                className="font-mono font-bold text-xs border border-slate-300 rounded px-2.5 py-1.5 w-24 bg-white"
              />
              <span className="text-xs font-mono font-bold text-slate-500">MW</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
              Load Damping (D)
              <TooltipBadge content="Percent change in system load per 1% frequency deviation (typically 1.0 – 2.0)." />
            </span>
            <input
              type="number"
              step="0.2"
              min="0"
              max="5"
              value={dampingD}
              onChange={(e) => setDampingD(parseFloat(e.target.value) || 0)}
              className="font-mono font-bold text-xs border border-slate-300 rounded px-2.5 py-1.5 w-20 bg-white"
            />
          </div>

          <button
            onClick={runCalculation}
            disabled={loading || busCount === 0}
            className="px-3.5 py-1.5 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
            <span>Solve Pickup</span>
          </button>
        </div>

        <div className="flex items-center gap-5 text-xs font-mono">
          <div>
            <span className="text-slate-400 block text-[10px]">Settling Freq</span>
            <span className="font-bold text-slate-900">
              {result?.settling_frequency_hz ?? 50.0} Hz
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Δf Shift</span>
            <span className="font-bold text-rose-700">
              {result?.frequency_deviation_hz ?? 0} Hz
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">System Stiffness</span>
            <span className="font-bold text-slate-900">
              {result?.system_stiffness_mw_per_hz ?? 0} MW/Hz
            </span>
          </div>
        </div>
      </div>

      {/* Generator Droop Allocation Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
          Synchronous Governor Droop Allocation Table ({result?.allocations?.length ?? 0} Units)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[680px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Station</th>
                <th className="py-2.5 px-3">Rated Capacity</th>
                <th className="py-2.5 px-3">Droop (R)</th>
                <th className="py-2.5 px-3">Participation</th>
                <th className="py-2.5 px-3">Assigned Pickup</th>
                <th className="py-2.5 px-3">New Dispatch</th>
                <th className="py-2.5 px-3 text-right">Headroom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {(result?.allocations || []).map((gen) => (
                <tr key={gen.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-sans font-bold text-slate-900">{gen.name}</td>
                  <td className="py-2 px-3">{gen.rated_mw} MW</td>
                  <td className="py-2 px-3">{gen.droop_percent}%</td>
                  <td className="py-2 px-3 font-bold text-[#500b50]">
                    {gen.participation_factor_percent}%
                  </td>
                  <td className="py-2 px-3 font-bold text-emerald-700">
                    +{gen.allocated_delta_mw} MW
                  </td>
                  <td className="py-2 px-3">{gen.new_p_mw} MW</td>
                  <td
                    className={`py-2 px-3 text-right font-bold ${
                      gen.exceeded_rating ? 'text-rose-600' : 'text-slate-700'
                    }`}
                  >
                    {gen.remaining_headroom_mw >= 0
                      ? `+${gen.remaining_headroom_mw} MW`
                      : `${gen.remaining_headroom_mw} MW (Over)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parallel Multi-Circuit Corridors */}
      {result?.parallel_corridors && result.parallel_corridors.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
            Parallel Multi-Circuit Corridor Current Sharing ({result.parallel_corridors.length}{' '}
            Corridors)
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {result.parallel_corridors.map((cor) => (
              <div key={`${cor.from_bus}-${cor.to_bus}`} className="p-3 space-y-1.5">
                <div className="font-bold text-slate-900">
                  {cor.corridor}{' '}
                  <span className="font-mono text-[11px] font-normal text-slate-500">
                    ({cor.circuits_count} parallel circuits)
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cor.circuits.map((c) => (
                    <span
                      key={c.line_id}
                      className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-slate-700"
                    >
                      #{c.line_id} {c.name}: X={c.reactance_ohm} Ω →{' '}
                      <strong className="text-[#500b50]">{c.theoretical_share_percent}%</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
