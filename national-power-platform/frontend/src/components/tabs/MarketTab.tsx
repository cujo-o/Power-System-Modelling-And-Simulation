'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { TooltipBadge } from '@/components/ui/TooltipBadge';
import { ApiResult } from '@/lib/apiClient';
import { BusData, LoadSharingResult } from '@/types/grid';

interface MarketTabProps {
  buses?: BusData[];
  modelName?: string;
  callWithHydration?: <T = Record<string, unknown>>(
    path: string,
    options?: RequestInit
  ) => Promise<ApiResult<T>>;
}

interface DynamicGenUnit {
  id: string;
  name: string;
  busId: number;
  type: 'Hydro' | 'Thermal (Gas)' | 'Slack / Reference';
  availableMw: number;
  baseDispatchMw: number;
  baseMarginalCostNaira: number;
  markupPercent: number;
}

export const MarketTab: React.FC<MarketTabProps> = ({
  buses = [],
  modelName = '',
  callWithHydration,
}) => {
  const [discoveredUnits, setDiscoveredUnits] = useState<DynamicGenUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  const modelBaseDemandMw = useMemo(() => {
    if (buses.length === 0) return 0;
    const loadSum = buses.reduce((acc, b) => acc + (b.p_mw > 0 ? b.p_mw : 0), 0);
    const genSum = buses.reduce((acc, b) => acc + (b.p_mw < 0 ? Math.abs(b.p_mw) : 0), 0);
    return Math.round(loadSum > 10 ? loadSum : genSum > 10 ? genSum : 0);
  }, [buses]);

  const [demandOverride, setDemandOverride] = useState<{ model: string; value: number } | null>(
    null
  );
  const targetDemandMw =
    demandOverride && demandOverride.model === modelName
      ? demandOverride.value
      : modelBaseDemandMw;
  const [gasPriceUsd, setGasPriceUsd] = useState<number>(2.42);
  const [clearingRule, setClearingRule] = useState<'SMP' | 'PAY_AS_BID'>('SMP');
  const [biddingMode, setBiddingMode] = useState<'COMPETITIVE' | 'STRATEGIC'>('STRATEGIC');
  const [priceCapNaira, setPriceCapNaira] = useState<number>(85000);

  // Discover generating units from backend solver (hydrated) with bus-telemetry fallback
  useEffect(() => {
    let cancelled = false;

    const loadModelGenerators = async () => {
      if (buses.length === 0) {
        if (!cancelled) setDiscoveredUnits([]);
        return;
      }

      if (!cancelled) setLoadingUnits(true);
      if (callWithHydration) {
        try {
          const res = await callWithHydration<LoadSharingResult>(
            '/api/simulations/load-sharing/solve',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                load_step_mw: 100,
                system_damping_d: 1.2,
                droop_overrides: {},
              }),
            }
          );

          if (res.ok && !cancelled && Array.isArray(res.body?.allocations) && res.body.allocations.length > 0) {
            const mapped: DynamicGenUnit[] = res.body.allocations.map((g, idx) => {
              const nameStr = String(g.name || `Gen Bus #${g.bus_id}`);
              const isHydro = /kainji|jebba|shiroro|zungeru|dadinkowa|hydro/i.test(nameStr);
              const isSlack = /slack/i.test(nameStr);
              const ratedMw = Math.max(25, Math.round(Number(g.rated_mw || g.base_p_mw * 1.3 || 150)));
              const baseCost = isHydro
                ? 18500 + (idx % 4) * 900
                : 48000 + (idx % 6) * 2400;

              return {
                id: String(g.id || `gen-${idx}`),
                name: nameStr,
                busId: Number(g.bus_id || idx + 1),
                type: isHydro ? 'Hydro' : isSlack ? 'Slack / Reference' : 'Thermal (Gas)',
                availableMw: ratedMw,
                baseDispatchMw: Math.round(Number(g.base_p_mw || ratedMw * 0.65)),
                baseMarginalCostNaira: baseCost,
                markupPercent: isHydro ? 2 : 6 + (idx % 5) * 2,
              };
            });
            setDiscoveredUnits(mapped);
            setLoadingUnits(false);
            return;
          }
        } catch {}
      }

      if (!cancelled) {
        const genBuses = buses.filter((b) => Boolean(b.is_gen) || (b.p_mw ?? 0) < 0);
        const sourceList = genBuses.length > 0 ? genBuses : buses.slice(0, Math.min(8, buses.length));
        const fallbackUnits: DynamicGenUnit[] = sourceList.map((b, idx) => {
          const bName = b.name || `Bus #${b.id}`;
          const isHydro = /kainji|jebba|shiroro|zungeru|hydro/i.test(bName);
          const baseP = Math.max(20, Math.abs(Math.round(b.p_mw || 80)));

          return {
            id: `bus-gen-${b.id}`,
            name: bName.includes('Bus') ? `Gen @ ${bName}` : bName,
            busId: b.id,
            type: isHydro ? 'Hydro' : idx === 0 ? 'Slack / Reference' : 'Thermal (Gas)',
            availableMw: Math.round(baseP * 1.35),
            baseDispatchMw: baseP,
            baseMarginalCostNaira: isHydro ? 19000 + idx * 800 : 49000 + idx * 2500,
            markupPercent: isHydro ? 2 : 8,
          };
        });

        setDiscoveredUnits(fallbackUnits);
        setLoadingUnits(false);
      }
    };

    loadModelGenerators();
    return () => {
      cancelled = true;
    };
  }, [modelName, buses, callWithHydration]);

  // Merit-order clearing and settlement
  const marketSolution = useMemo(() => {
    const gasMultiplier = gasPriceUsd / 2.42;

    const bids = discoveredUnits
      .map((u) => {
        const fuelAdjustedCost =
          u.type === 'Hydro' ? u.baseMarginalCostNaira : u.baseMarginalCostNaira * gasMultiplier;
        const markup = biddingMode === 'STRATEGIC' ? u.markupPercent / 100 : 0;
        const submittedBid = Math.min(priceCapNaira, Math.round(fuelAdjustedCost * (1 + markup)));
        return { ...u, fuelAdjustedCost: Math.round(fuelAdjustedCost), submittedBid };
      })
      .sort((a, b) => a.submittedBid - b.submittedBid);

    let remainingDemand = targetDemandMw;
    let systemMarginalPrice = 0;

    const dispatched: Array<(typeof bids)[number] & { clearedMw: number }> = [];
    for (const b of bids) {
      const clearedMw = Math.max(0, Math.min(b.availableMw, remainingDemand));
      remainingDemand -= clearedMw;
      if (clearedMw > 0) {
        systemMarginalPrice = Math.max(systemMarginalPrice, b.submittedBid);
      }
      dispatched.push({ ...b, clearedMw });
    }

    const schedule = dispatched.map((d) => {
      const settlementPrice = clearingRule === 'SMP' ? systemMarginalPrice : d.submittedBid;
      return {
        ...d,
        settlementPrice: d.clearedMw > 0 ? settlementPrice : 0,
        hourlyRevenueNaira: d.clearedMw * settlementPrice,
      };
    });

    const totalAvailableMw = schedule.reduce((acc, s) => acc + s.availableMw, 0);
    const totalClearedMw = schedule.reduce((acc, s) => acc + s.clearedMw, 0);
    const unservedMw = Math.max(0, targetDemandMw - totalClearedMw);
    const totalHourlyCostNaira = schedule.reduce((acc, s) => acc + s.hourlyRevenueNaira, 0);
    const weightedAvgPrice =
      totalClearedMw > 0 ? Math.round(totalHourlyCostNaira / totalClearedMw) : 0;

    return {
      schedule,
      totalAvailableMw,
      totalClearedMw,
      unservedMw,
      systemMarginalPrice,
      weightedAvgPrice,
      totalHourlyCostNaira,
    };
  }, [discoveredUnits, targetDemandMw, gasPriceUsd, clearingRule, biddingMode, priceCapNaira]);

  // Nodal load allocation sorted descending by demand (shows all active load substations)
  const loadBusesAllocation = useMemo(() => {
    const positiveBuses = buses.filter((b) => (b.p_mw ?? 0) > 0);
    const list = (positiveBuses.length > 0 ? positiveBuses : buses)
      .slice()
      .sort((a, b) => (b.p_mw ?? 0) - (a.p_mw ?? 0));
    const totalRawLoad = list.reduce((acc, b) => acc + Math.max(1, Math.abs(b.p_mw || 10)), 0) || 1;

    return list.map((b) => {
      const weight = Math.max(1, Math.abs(b.p_mw || 10)) / totalRawLoad;
      const allocatedMw = Number((marketSolution.totalClearedMw * weight).toFixed(1));
      const hourlyObligationM = (allocatedMw * marketSolution.weightedAvgPrice) / 1_000_000;

      return {
        id: b.id,
        name: b.name || `Substation #${b.id}`,
        zone: b.zone || 'Transmission',
        v_pu: b.v_pu ?? 1.0,
        sharePct: weight * 100,
        allocatedMw,
        hourlyObligationM,
      };
    });
  }, [buses, marketSolution.totalClearedMw, marketSolution.weightedAvgPrice]);

  if (buses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-xs text-slate-500 rounded-2xl border border-dashed border-slate-300 bg-white">
        Select or upload a grid model in <strong>Grid Stability Models</strong> to run wholesale market clearing.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 py-1 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Wholesale Electricity Market &amp; Economic Dispatch
            </h2>
            {modelName && (
              <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold font-mono">
                {modelName} ({buses.length} Buses • {discoveredUnits.length} Gen Units)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Merit-order generator clearing and nodal load settlement coupled to the active grid model.
          </p>
        </div>

        <button
          onClick={() => setDemandOverride(null)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingUnits ? 'animate-spin' : ''}`} />
          <span>Sync Demand ({modelBaseDemandMw} MW)</span>
        </button>
      </div>

      {/* Market Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>System Demand (MW)</span>
            <TooltipBadge content="Total active demand to clear across the active model's generating units." />
          </label>
          <input
            type="number"
            step="25"
            min="10"
            max="15000"
            value={targetDemandMw}
            onChange={(e) =>
              setDemandOverride({ model: modelName, value: Math.max(0, Number(e.target.value)) })
            }
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
          />
          <span className="text-[10px] text-slate-400 block">
            Model Base Load: {modelBaseDemandMw} MW
          </span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Gas Price ($/MMBtu)</span>
            <TooltipBadge content="Natural gas benchmark price scaling thermal generator short-run marginal cost." />
          </label>
          <input
            type="number"
            step="0.10"
            min="1.0"
            max="6.0"
            value={gasPriceUsd}
            onChange={(e) => setGasPriceUsd(Number(e.target.value) || 2.42)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
          />
          <span className="text-[10px] text-slate-400 block">Thermal Fuel Index</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Settlement Rule</span>
            <TooltipBadge content="Uniform SMP pays all cleared generators the marginal clearing price. Pay-as-Bid settles each unit at its submitted bid." />
          </label>
          <select
            value={clearingRule}
            onChange={(e) => setClearingRule(e.target.value as 'SMP' | 'PAY_AS_BID')}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-xs bg-slate-50"
          >
            <option value="SMP">Uniform SMP (Marginal Pricing)</option>
            <option value="PAY_AS_BID">Pay-as-Bid (Bilateral / Vesting)</option>
          </select>
          <span className="text-[10px] text-slate-400 block">Clearing Mechanism</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Bidding Mode</span>
            <TooltipBadge content="Competitive bids equal fuel marginal cost. Strategic mode adds scarcity markup." />
          </label>
          <select
            value={biddingMode}
            onChange={(e) => setBiddingMode(e.target.value as 'COMPETITIVE' | 'STRATEGIC')}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-xs bg-slate-50"
          >
            <option value="STRATEGIC">Strategic Offer Markup</option>
            <option value="COMPETITIVE">Marginal Cost (SRMC)</option>
          </select>
          <span className="text-[10px] text-slate-400 block">GenCo Offer Behavior</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Price Cap (₦/MWh)</span>
            <TooltipBadge content="Regulatory maximum wholesale offer price permitted during peak demand." />
          </label>
          <input
            type="number"
            step="5000"
            value={priceCapNaira}
            onChange={(e) => setPriceCapNaira(Number(e.target.value) || 85000)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
          />
          <span className="text-[10px] text-slate-400 block">Regulatory Ceiling</span>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
            <span>System Marginal Price (SMP)</span>
            <TooltipBadge content="Offer price of the last generating unit required to meet demand." />
          </span>
          <span className="text-lg font-black text-[#500b50] mt-0.5 block">
            ₦{marketSolution.systemMarginalPrice.toLocaleString()}/MWh
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
            <span>Cleared / Available</span>
            <TooltipBadge content="Total power cleared versus total generating capacity discovered in the active model." />
          </span>
          <span className="text-lg font-black text-emerald-700 mt-0.5 block">
            {marketSolution.totalClearedMw.toLocaleString()} /{' '}
            {marketSolution.totalAvailableMw.toLocaleString()} MW
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
            <span>Unserved Energy Deficit</span>
            <TooltipBadge content="Demand exceeding the model's total available generation capacity." />
          </span>
          <span
            className={`text-lg font-black mt-0.5 block ${
              marketSolution.unservedMw > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {marketSolution.unservedMw.toLocaleString()} MW
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
            <span>Hourly Settlement</span>
            <TooltipBadge content="Total hourly wholesale payment across all cleared generating units." />
          </span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">
            ₦{(marketSolution.totalHourlyCostNaira / 1_000_000).toFixed(2)}M / hr
          </span>
        </div>
      </div>

      {/* Merit-Order Generator Schedule */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            Merit-Order Generator Dispatch ({modelName || 'Active Model'})
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            {marketSolution.schedule.length} Units
          </span>
        </div>
        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Generator Unit</th>
                <th className="py-2.5 px-3">Bus</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Capacity (MW)</th>
                <th className="py-2.5 px-3">Marginal Cost</th>
                <th className="py-2.5 px-3">Offer Bid (₦/MWh)</th>
                <th className="py-2.5 px-3">Cleared (MW)</th>
                <th className="py-2.5 px-3 text-right">Hourly Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {marketSolution.schedule.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-sans font-bold text-slate-900">{item.name}</td>
                  <td className="py-2 px-3 text-slate-500">Bus #{item.busId}</td>
                  <td className="py-2 px-3 font-sans text-slate-600">{item.type}</td>
                  <td className="py-2 px-3">{item.availableMw} MW</td>
                  <td className="py-2 px-3 text-slate-500">
                    ₦{item.fuelAdjustedCost.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-bold text-[#500b50]">
                    ₦{item.submittedBid.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-bold text-emerald-700">{item.clearedMw} MW</td>
                  <td className="py-2 px-3 text-right font-semibold">
                    ₦{(item.hourlyRevenueNaira / 1_000_000).toFixed(2)}M
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Substation Offtake Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            Substation Load Offtake &amp; Wholesale Obligation ({loadBusesAllocation.length} Nodes)
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            Weighted Rate: ₦{marketSolution.weightedAvgPrice.toLocaleString()}/MWh
          </span>
        </div>
        <div className="overflow-x-auto max-h-[340px]">
          <table className="w-full text-left text-xs min-w-[620px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
              <tr>
                <th className="py-2 px-3">Substation / Load Node</th>
                <th className="py-2 px-3">Zone</th>
                <th className="py-2 px-3">Bus Voltage</th>
                <th className="py-2 px-3">Load Share</th>
                <th className="py-2 px-3">Allocated Power</th>
                <th className="py-2 px-3 text-right">Hourly Obligation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {loadBusesAllocation.map((node) => (
                <tr key={node.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-sans font-bold text-slate-900">
                    #{node.id}: {node.name}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-500">{node.zone}</td>
                  <td className="py-2 px-3">
                    <span
                      className={
                        node.v_pu < 0.95
                          ? 'text-rose-600 font-bold'
                          : node.v_pu > 1.05
                          ? 'text-amber-600 font-bold'
                          : 'text-emerald-700 font-bold'
                      }
                    >
                      {node.v_pu.toFixed(3)} pu
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-500">{node.sharePct.toFixed(1)}%</td>
                  <td className="py-2 px-3 font-bold text-slate-800">{node.allocatedMw} MW</td>
                  <td className="py-2 px-3 text-right font-semibold text-[#500b50]">
                    ₦{node.hourlyObligationM.toFixed(2)}M / hr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
