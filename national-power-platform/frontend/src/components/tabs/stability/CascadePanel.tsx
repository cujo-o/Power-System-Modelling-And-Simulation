'use client';

import React, { useState } from 'react';
import { Activity, RefreshCw, AlertTriangle, ShieldAlert, ArrowRight } from 'lucide-react';
import { TooltipBadge } from '@/components/ui/TooltipBadge';
import { LineData, CascadeResult } from '@/types/grid';

interface CascadePanelProps {
  lines: LineData[];
  onCascadeTrigger: (initialTripped: number[], threshold: number) => Promise<CascadeResult>;
  onViewCascadeOnSld: (trippedList: number[]) => void;
}

export const CascadePanel: React.FC<CascadePanelProps> = ({
  lines,
  onCascadeTrigger,
  onViewCascadeOnSld,
}) => {
  const [cascadeThreshold, setCascadeThreshold] = useState<number>(100);
  const [selectedTripLine, setSelectedTripLine] = useState<number | null>(null);
  const initialTripLine =
    selectedTripLine !== null && lines.some((l) => l.id === selectedTripLine)
      ? selectedTripLine
      : lines[0]?.id ?? 0;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CascadeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunCascade = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onCascadeTrigger([initialTripLine], cascadeThreshold);
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Cascade simulation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAndView = () => {
    if (!result) return;
    const collected = new Set<number>();
    (result.all_tripped_lines || []).forEach((id) => collected.add(Number(id)));
    (result.timeline || []).forEach((step) => {
      (step.tripped_in_this_step || []).forEach((id) => collected.add(Number(id)));
    });
    if (collected.size === 0) collected.add(Number(initialTripLine));
    onViewCascadeOnSld(Array.from(collected).filter((n) => Number.isFinite(n)));
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 flex items-center">
              Initiating Contingency Branch
              <TooltipBadge content="Select the primary line circuit breaker to trip open first." />
            </label>
            <select
              value={initialTripLine}
              onChange={(e) => setSelectedTripLine(Number(e.target.value))}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white font-semibold"
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  #{l.id}: {l.name || `Bus #${l.from_bus} → Bus #${l.to_bus}`} (
                  {(l.loading_percent ?? 0).toFixed(0)}% load)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 flex items-center">
              Overcurrent Relay Threshold (%)
              <TooltipBadge content="Continuous current loading threshold at which thermal relays trip an overloaded line." />
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="80"
                max="160"
                step="5"
                value={cascadeThreshold}
                onChange={(e) => setCascadeThreshold(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold bg-white"
              />
              <span className="font-mono text-xs font-bold text-slate-500">%</span>
            </div>
            <div className="flex gap-1 pt-1">
              {[95, 100, 115, 130].map((val) => (
                <button
                  key={val}
                  onClick={() => setCascadeThreshold(val)}
                  className="flex-1 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleRunCascade}
              disabled={loading || lines.length === 0}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white py-2 text-xs font-bold transition disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity className="h-3.5 w-3.5" />
              )}
              <span>Run Cascade</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              <span className="font-black text-sm text-slate-900 uppercase">
                {(result.status || '').replace(/_/g, ' ')}
              </span>
            </div>
            <button
              onClick={handleApplyAndView}
              className="px-3.5 py-1.5 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition self-start sm:self-auto"
            >
              <span>Apply Outages &amp; View on SLD</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-slate-700 leading-relaxed">
            Initiating outage on circuit #{initialTripLine} resulted in{' '}
            <strong className="text-rose-700 font-mono font-bold">
              {result.all_tripped_lines?.length || 0} isolated circuit(s)
            </strong>{' '}
            across <strong>{result.total_steps} cascading stage(s)</strong> at the {cascadeThreshold}% threshold.
          </p>

          {result.timeline && result.timeline.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-white overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Stage</th>
                    <th className="py-2 px-3">Event</th>
                    <th className="py-2 px-3">Isolated Branches</th>
                    <th className="py-2 px-3 text-right">Max Loading</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {result.timeline.map((stepItem, sIdx) => (
                    <tr key={sIdx} className="hover:bg-slate-50">
                      <td className="py-1.5 px-3 font-bold text-slate-400">Step {stepItem.step}</td>
                      <td className="py-1.5 px-3 font-sans text-slate-800">{stepItem.description}</td>
                      <td className="py-1.5 px-3 text-rose-700">
                        {stepItem.tripped_in_this_step?.length > 0
                          ? stepItem.tripped_in_this_step.map((id) => `#${id}`).join(', ')
                          : 'None'}
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold">
                        {(stepItem.max_loading_percent || 0).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.islands && result.islands.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 font-bold text-[11px] uppercase text-slate-600">
                Post-Cascade Topological Islands ({result.islands.length})
              </div>
              <div className="divide-y divide-slate-100">
                {result.islands.map((isl) => (
                  <div
                    key={isl.island_id}
                    className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">
                        Island #{isl.island_id} ({isl.bus_count} buses)
                      </span>
                      <span className="text-slate-500 ml-2 font-mono text-[11px]">
                        Gen: {isl.generation_mw} MW • Load: {isl.demand_mw} MW
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isl.status === 'SYNCHRONOUS_ONLINE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isl.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
