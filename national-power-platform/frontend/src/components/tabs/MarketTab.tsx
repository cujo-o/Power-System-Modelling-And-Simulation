'use client';

import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Activity,
  Building2,
  Zap,
} from 'lucide-react';
import { BusData, LineData } from '@/types/grid';

interface MarketTabProps {
  buses?: BusData[];
  lines?: LineData[];
  modelName?: string;
}

interface GenCoAgent {
  id: string;
  name: string;
  type: 'Thermal (Gas)' | 'Hydro';
  zone: string;
  availableMw: number;
  baseMarginalCostNaira: number;
  strategicMarkupPercent: number;
}

const INITIAL_GENCOS: GenCoAgent[] = [
  { id: 'g1', name: 'Kainji Hydro GS', type: 'Hydro', zone: 'North-Central', availableMw: 580, baseMarginalCostNaira: 18500, strategicMarkupPercent: 0 },
  { id: 'g2', name: 'Jebba Hydro GS', type: 'Hydro', zone: 'North-Central', availableMw: 480, baseMarginalCostNaira: 19200, strategicMarkupPercent: 0 },
  { id: 'g3', name: 'Shiroro Hydro GS', type: 'Hydro', zone: 'North-Central', availableMw: 450, baseMarginalCostNaira: 20500, strategicMarkupPercent: 5 },
  { id: 'g4', name: 'Zungeru Hydro GS', type: 'Hydro', zone: 'North-Central', availableMw: 600, baseMarginalCostNaira: 21000, strategicMarkupPercent: 5 },
  { id: 'g5', name: 'Egbin Thermal PS', type: 'Thermal (Gas)', zone: 'South-West', availableMw: 880, baseMarginalCostNaira: 54000, strategicMarkupPercent: 10 },
  { id: 'g6', name: 'Azura-Edo IPP', type: 'Thermal (Gas)', zone: 'Mid-West', availableMw: 450, baseMarginalCostNaira: 58000, strategicMarkupPercent: 8 },
  { id: 'g7', name: 'Okpai IPP', type: 'Thermal (Gas)', zone: 'South-South', availableMw: 420, baseMarginalCostNaira: 52000, strategicMarkupPercent: 5 },
  { id: 'g8', name: 'Geregu NIPP', type: 'Thermal (Gas)', zone: 'North-Central', availableMw: 380, baseMarginalCostNaira: 61000, strategicMarkupPercent: 12 },
  { id: 'g9', name: 'Olorunsogo NIPP', type: 'Thermal (Gas)', zone: 'South-West', availableMw: 360, baseMarginalCostNaira: 64500, strategicMarkupPercent: 15 },
  { id: 'g10', name: 'Afam VI IPP', type: 'Thermal (Gas)', zone: 'South-South', availableMw: 450, baseMarginalCostNaira: 53000, strategicMarkupPercent: 6 },
];

const DISCO_SHARES = [
  { name: 'Ikeja Electric (IE)', sharePct: 15.0 },
  { name: 'Eko Electricity (EKEDC)', sharePct: 13.0 },
  { name: 'Abuja Electricity (AEDC)', sharePct: 13.0 },
  { name: 'Ibadan Electricity (IBEDC)', sharePct: 12.5 },
  { name: 'Benin Electricity (BEDC)', sharePct: 9.0 },
  { name: 'Enugu Electricity (EEDC)', sharePct: 8.5 },
  { name: 'Port Harcourt (PHED)', sharePct: 7.5 },
  { name: 'Kano Electricity (KEDCO)', sharePct: 7.0 },
  { name: 'Kaduna Electric (KAEDCO)', sharePct: 6.5 },
  { name: 'Jos Electricity (JED)', sharePct: 4.5 },
  { name: 'Yola Electricity (YEDC)', sharePct: 3.5 },
];

export const MarketTab: React.FC<MarketTabProps> = ({
  buses = [],
  lines = [],
  modelName = '',
}) => {
  const [targetDemandMw, setTargetDemandMw] = useState<number>(4200);
  const [gasPriceUsd, setGasPriceUsd] = useState<number>(2.42);
  const [clearingRule, setClearingRule] = useState<'SMP' | 'PAY_AS_BID'>('SMP');
  const [agentBehavior, setAgentBehavior] = useState<'COMPETITIVE' | 'STRATEGIC_RL'>('STRATEGIC_RL');
  const [priceCapNaira, setPriceCapNaira] = useState<number>(85000);

  const marketSolution = useMemo(() => {
    const gasMultiplier = gasPriceUsd / 2.42;

    const bids = INITIAL_GENCOS.map((g) => {
      const fuelAdjustedCost =
        g.type === 'Thermal (Gas)'
          ? g.baseMarginalCostNaira * gasMultiplier
          : g.baseMarginalCostNaira;

      const markup =
        agentBehavior === 'STRATEGIC_RL' ? g.strategicMarkupPercent / 100 : 0;

      const submittedBid = Math.min(
        priceCapNaira,
        Math.round(fuelAdjustedCost * (1 + markup))
      );

      return {
        ...g,
        fuelAdjustedCost: Math.round(fuelAdjustedCost),
        submittedBid,
      };
    }).sort((a, b) => a.submittedBid - b.submittedBid);

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

    const finalSchedule = dispatched.map((d) => {
      const settlementPrice =
        clearingRule === 'SMP' ? systemMarginalPrice : d.submittedBid;
      const hourlyRevenueNaira = d.clearedMw * settlementPrice;
      const hourlyProfitNaira =
        d.clearedMw * (settlementPrice - d.fuelAdjustedCost);

      return {
        ...d,
        settlementPrice: d.clearedMw > 0 ? settlementPrice : 0,
        hourlyRevenueNaira,
        hourlyProfitNaira,
      };
    });

    const totalClearedMw = finalSchedule.reduce((acc, item) => acc + item.clearedMw, 0);
    const unservedMw = Math.max(0, targetDemandMw - totalClearedMw);
    const totalHourlyCostNaira = finalSchedule.reduce(
      (acc, item) => acc + item.hourlyRevenueNaira,
      0
    );
    const weightedAvgPrice =
      totalClearedMw > 0 ? Math.round(totalHourlyCostNaira / totalClearedMw) : 0;

    return {
      schedule: finalSchedule,
      systemMarginalPrice,
      weightedAvgPrice,
      totalClearedMw,
      unservedMw,
      totalHourlyCostNaira,
    };
  }, [targetDemandMw, gasPriceUsd, clearingRule, agentBehavior, priceCapNaira]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 py-1 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Nigerian Electricity Market Simulation (ASSUME Framework)
            </h2>
            <span className="px-2 py-0.5 rounded bg-purple-100 text-[#500b50] text-[10px] font-bold font-mono">
              ASSUME-NESI
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Agent-based wholesale market clearing for Nigerian GenCos, NBET/TCN dispatch, and DisCo MYTO settlement.
            {modelName && ` Active Grid Model: ${modelName} (${buses.length} Substations, ${lines.length} Corridors).`}
          </p>
        </div>
      </div>

      {/* Market Parameter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 block">
            Total System Demand (MW)
          </label>
          <input
            type="number"
            step="100"
            min="1500"
            max="6500"
            value={targetDemandMw}
            onChange={(e) => setTargetDemandMw(Number(e.target.value) || 4000)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-xs bg-slate-50"
          />
          <span className="text-[10px] text-slate-400 block">Peak NESI Demand</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 block">
            Gas Supply Price ($/MMBtu)
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
          <span className="text-[10px] text-slate-400 block">Thermal GenCo Fuel Benchmark</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 block">
            Market Clearing Rule
          </label>
          <select
            value={clearingRule}
            onChange={(e: any) => setClearingRule(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-xs bg-slate-50"
          >
            <option value="SMP">Uniform SMP (Marginal Pricing)</option>
            <option value="PAY_AS_BID">Pay-as-Bid (Bilateral / Vesting)</option>
          </select>
          <span className="text-[10px] text-slate-400 block">Settlement Mechanism</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 block">
            ASSUME Agent Strategy
          </label>
          <select
            value={agentBehavior}
            onChange={(e: any) => setAgentBehavior(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-xs bg-slate-50"
          >
            <option value="STRATEGIC_RL">Strategic Markup (ASSUME RL)</option>
            <option value="COMPETITIVE">Short-Run Marginal Cost</option>
          </select>
          <span className="text-[10px] text-slate-400 block">GenCo Bidding Policy</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
          <label className="text-[11px] font-bold text-slate-600 block">
            NERC Price Cap (₦/MWh)
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
            System Marginal Price (SMP)
          </span>
          <span className="text-lg font-black text-[#500b50] mt-0.5 block">
            ₦{marketSolution.systemMarginalPrice.toLocaleString()}/MWh
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
            Cleared Generation Volume
          </span>
          <span className="text-lg font-black text-emerald-700 mt-0.5 block">
            {marketSolution.totalClearedMw.toLocaleString()} MW
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
            Unserved Energy Deficit
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
          <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
            Hourly Wholesale Settlement
          </span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">
            ₦{(marketSolution.totalHourlyCostNaira / 1_000_000).toFixed(2)}M / hr
          </span>
        </div>
      </div>

      {/* Merit-Order GenCo Agent Clearing Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            ASSUME Merit-Order GenCo Agent Dispatch Schedule
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            Sorted by Submitted Agent Offer (₦/MWh)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">GenCo Agent</th>
                <th className="py-2.5 px-3">Technology</th>
                <th className="py-2.5 px-3">Available (MW)</th>
                <th className="py-2.5 px-3">Marginal Cost</th>
                <th className="py-2.5 px-3">Agent Bid (₦/MWh)</th>
                <th className="py-2.5 px-3">Cleared (MW)</th>
                <th className="py-2.5 px-3 text-right">Hourly Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {marketSolution.schedule.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-sans font-bold text-slate-900">{item.name}</td>
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

      {/* DisCo Wholesale Allocation Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            11 Nigerian Distribution Companies (DisCos) Load Allocation &amp; Invoice
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            Weighted Wholesale Rate: ₦{marketSolution.weightedAvgPrice.toLocaleString()}/MWh
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[600px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Distribution Company (DisCo)</th>
                <th className="py-2.5 px-3">MYTO Vesting Share</th>
                <th className="py-2.5 px-3">Allocated Power (MW)</th>
                <th className="py-2.5 px-3 text-right">Hourly Market Obligation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {DISCO_SHARES.map((d) => {
                const mw = Math.round((marketSolution.totalClearedMw * d.sharePct) / 100);
                const costM = (mw * marketSolution.weightedAvgPrice) / 1_000_000;
                return (
                  <tr key={d.name} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-sans font-bold text-slate-900">{d.name}</td>
                    <td className="py-2 px-3 text-slate-500">{d.sharePct.toFixed(1)}%</td>
                    <td className="py-2 px-3 font-bold text-slate-800">{mw} MW</td>
                    <td className="py-2 px-3 text-right font-semibold text-[#500b50]">
                      ₦{costM.toFixed(2)}M / hr
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};