'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { BusData, LineData } from '@/types/grid';

interface MarketTabProps {
  buses?: BusData[];
  lines?: LineData[];
  modelName?: string;
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

export const MarketTab: React.FC<MarketTabProps> = ({
  buses = [],
  lines = [],
  modelName = '',
}) => {
  const [discoveredUnits, setDiscoveredUnits] = useState<DynamicGenUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Calculate actual demand and generation from active model's buses
  const modelBaseDemandMw = useMemo(() => {
    const loadSum = buses.reduce((acc, b) => acc + (b.p_mw > 0 ? b.p_mw : 0), 0);
    const genSum = buses.reduce((acc, b) => acc + (b.p_mw < 0 ? Math.abs(b.p_mw) : 0), 0);
    return Math.round(loadSum > 10 ? loadSum : genSum > 10 ? genSum : 350);
  }, [buses]);

  const [targetDemandMw, setTargetDemandMw] = useState<number>(modelBaseDemandMw);
  const [gasPriceUsd, setGasPriceUsd] = useState<number>(2.42);
  const [clearingRule, setClearingRule] = useState<'SMP' | 'PAY_AS_BID'>('SMP');
  const [biddingMode, setBiddingMode] = useState<'COMPETITIVE' | 'STRATEGIC'>('STRATEGIC');
  const [priceCapNaira, setPriceCapNaira] = useState<number>(85000);

  // Sync default demand whenever the active model changes
  useEffect(() => {
    setTargetDemandMw(modelBaseDemandMw);
  }, [modelBaseDemandMw, modelName]);

  // Discover real generators from the active model via solver endpoint + bus telemetry
  useEffect(() => {
    let cancelled = false;

    const loadModelGenerators = async () => {
      setLoadingUnits(true);
      try {
        const res = await fetch(`${API_BASE}/api/simulations/load-sharing/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            load_step_mw: 100,
            system_damping_d: 1.2,
            droop_overrides: {},
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data?.allocations) && data.allocations.length > 0) {
            const mapped: DynamicGenUnit[] = data.allocations.map((g: any, idx: number) => {
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
        }
      } catch {}

      // Fallback: derive directly from the active model's `buses` array
      if (!cancelled) {
        const genBuses = buses.filter((b) => (b.p_mw ?? 0) < 0);
        const sourceList = genBuses.length > 0 ? genBuses : buses.slice(0, Math.min(8, buses.length));

        const fallbackUnits: DynamicGenUnit[] = sourceList.map((b, idx) => {
          const bName = b.name || `Bus #${b.id}`;
          const isHydro = /kainji|jebba|shiroro|zungeru|hydro/i.test(bName);
          const baseP = Math.max(20, Math.abs(Math.round(b.p_mw || 80)));
          const capMw = Math.round(baseP * 1.35);

          return {
            id: `bus-gen-${b.id}`,
            name: bName.includes('Bus') ? `Gen @ ${bName}` : bName,
            busId: b.id,
            type: isHydro ? 'Hydro' : idx === 0 ? 'Slack / Reference' : 'Thermal (Gas)',
            availableMw: capMw,
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
  }, [modelName, buses]);

  // Dynamic Merit-Order Market Clearing
  const marketSolution = useMemo(() => {
    const gasMultiplier = gasPriceUsd / 2.42;

    const bids = discoveredUnits
      .map((u) => {
        const fuelAdjustedCost =
          u.type === 'Hydro'
            ? u.baseMarginalCostNaira
            : u.baseMarginalCostNaira * gasMultiplier;

        const markup = biddingMode === 'STRATEGIC' ? u.markupPercent / 100 : 0;
        const submittedBid = Math.min(
          priceCapNaira,
          Math.round(fuelAdjustedCost * (1 + markup))
        );

        return {
          ...u,
          fuelAdjustedCost: Math.round(fuelAdjustedCost),
          submittedBid,
        };
      })
      .sort((a, b) => a.submittedBid - b.submittedBid);

    let remainingDemand = targetDemandMw;
    let systemMarginalPrice = 0;

    const dispatched = bids.map((b) => {
      const clearedMw = Math.max(0, Math.min(b.availableMw, remainingDemand));
      remainingDemand -= clearedMw;
      if (clearedMw > 0) {
        systemMarginalPrice = Math.max(systemMarginalPrice, b.submittedBid);
      }
      return {
        ...b,
        clearedMw,
      };
    });

    const schedule = dispatched.map((d) => {
      const settlementPrice =
        clearingRule === 'SMP' ? systemMarginalPrice : d.submittedBid;
      const hourlyRevenueNaira = d.clearedMw * settlementPrice;
      return {
        ...d,
        settlementPrice: d.clearedMw > 0 ? settlementPrice : 0,
        hourlyRevenueNaira,
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

  // Dynamic Load Center / Bus Offtake Obligations from the Active Model
  const loadBusesAllocation = useMemo(() => {
    const positiveBuses = buses.filter((b) => (b.p_mw ?? 0) > 0);
    const list = positiveBuses.length > 0 ? positiveBuses : buses;
    const totalRawLoad = list.reduce((acc, b) => acc + Math.max(1, Math.abs(b.p_mw || 10)), 0) || 1;

    return list.slice(0, 15).map((b) => {
      const weight = Math.max(1, Math.abs(b.p_mw || 10)) / totalRawLoad;
      const sharePct = weight * 100;
      const allocatedMw = Number((marketSolution.totalClearedMw * weight).toFixed(1));
      const hourlyObligationM =
        (allocatedMw * marketSolution.weightedAvgPrice) / 1_000_000;

      return {
        id: b.id,
        name: b.name || `Substation #${b.id}`,
        zone: b.zone || 'Grid Load Center',
        v_pu: b.v_pu ?? 1.0,
        sharePct,
        allocatedMw,
        hourlyObligationM,
      };
    });
  }, [buses, marketSolution.totalClearedMw, marketSolution.weightedAvgPrice]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 py-1 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
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
            Merit-order generator clearing and nodal load settlement dynamically coupled to the active simulation model.
          </p>
        </div>

        <button
          onClick={() => setTargetDemandMw(modelBaseDemandMw)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingUnits ? 'animate-spin' : ''}`} />
          <span>Sync Demand to Model ({modelBaseDemandMw} MW)</span>
        </button>
      </div>

      {/* Market Parameter Controls with ? Tooltips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>System Demand (MW)</span>
            <TooltipBadge content="Total active power demand to be cleared across the active model's generating units. Defaults to the active model's total load." />
          </label>
          <input
            type="number"
            step="25"
            min="10"
            max="15000"
            value={targetDemandMw}
            onChange={(e) => setTargetDemandMw(Math.max(0, Number(e.target.value)))}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
          />
          <span className="text-[10px] text-slate-400 block">
            Model Base Load: {modelBaseDemandMw} MW
          </span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Gas Price ($/MMBtu)</span>
            <TooltipBadge content="Natural gas fuel price benchmark. Directly scales the short-run marginal cost of thermal gas-fired generators." />
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
          <span className="text-[10px] text-slate-400 block">Thermal Fuel Cost Index</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Settlement Rule</span>
            <TooltipBadge content="Uniform SMP pays all cleared generators the offer price of the last marginal unit dispatched. Pay-as-Bid pays each generator its own submitted offer." />
          </label>
          <select
            value={clearingRule}
            onChange={(e: any) => setClearingRule(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-xs bg-slate-50"
          >
            <option value="SMP">Uniform SMP (Marginal Pricing)</option>
            <option value="PAY_AS_BID">Pay-as-Bid (Bilateral / Vesting)</option>
          </select>
          <span className="text-[10px] text-slate-400 block">Market Clearing Mechanism</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Generator Bidding Mode</span>
            <TooltipBadge content="Competitive mode bids exact marginal fuel cost. Strategic Markup adds scarcity and operational margin above base fuel cost." />
          </label>
          <select
            value={biddingMode}
            onChange={(e: any) => setBiddingMode(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-xs bg-slate-50"
          >
            <option value="STRATEGIC">Strategic Offer Markup</option>
            <option value="COMPETITIVE">Marginal Cost (SRMC)</option>
          </select>
          <span className="text-[10px] text-slate-400 block">GenCo Offer Behavior</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center">
            <span>Market Price Cap (₦/MWh)</span>
            <TooltipBadge content="Maximum wholesale offer price permitted by the regulator during peak scarcity." />
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

      {/* Summary KPI Cards with ? Tooltips */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
            <span>System Marginal Price (SMP)</span>
            <TooltipBadge content="The offer price of the most expensive generating unit required to meet the current system demand." />
          </span>
          <span className="text-lg font-black text-[#500b50] mt-0.5 block">
            ₦{marketSolution.systemMarginalPrice.toLocaleString()}/MWh
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
            <span>Cleared / Available Capacity</span>
            <TooltipBadge content="Total active power dispatched vs. total installed capacity discovered in the active grid model." />
          </span>
          <span className="text-lg font-black text-emerald-700 mt-0.5 block">
            {marketSolution.totalClearedMw.toLocaleString()} / {marketSolution.totalAvailableMw.toLocaleString()} MW
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 flex items-center">
            <span>Unserved Energy Deficit</span>
            <TooltipBadge content="Amount of system demand that cannot be met when target demand exceeds the active model's total available generation." />
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
            <span>Hourly Wholesale Settlement</span>
            <TooltipBadge content="Total wholesale market invoice across all dispatched generating units per hour." />
          </span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">
            ₦{(marketSolution.totalHourlyCostNaira / 1_000_000).toFixed(2)}M / hr
          </span>
        </div>
      </div>

      {/* Active Model Merit-Order Generator Dispatch Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            Merit-Order Generator Dispatch Schedule ({modelName || 'Active Model'})
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            {marketSolution.schedule.length} Generating Units Discovered in Model
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
                  <td className="py-2 px-3 font-bold text-emerald-700">
                    {item.clearedMw} MW
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    ₦{(item.hourlyRevenueNaira / 1_000_000).toFixed(2)}M
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Model Substation / Load Center Offtake Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            Active Model Substation Load Offtake &amp; Wholesale Obligation
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            Weighted Wholesale Rate: ₦{marketSolution.weightedAvgPrice.toLocaleString()}/MWh
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