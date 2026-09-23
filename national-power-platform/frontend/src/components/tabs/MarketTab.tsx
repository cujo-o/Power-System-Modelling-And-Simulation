'use client';

import React from 'react';
import { MarketResult } from '@/types/grid';
import { Play, RefreshCw, DollarSign, Fuel, Droplet, Layers } from 'lucide-react';

interface MarketTabProps {
  gasPriceFactor: number;
  setGasPriceFactor: (v: number) => void;
  hydroAvailability: number;
  setHydroAvailability: (v: number) => void;
  runMarketSimulation: () => void;
  marketLoading: boolean;
  marketResults: MarketResult | null;
}

export const MarketTab: React.FC<MarketTabProps> = ({
  gasPriceFactor,
  setGasPriceFactor,
  hydroAvailability,
  setHydroAvailability,
  runMarketSimulation,
  marketLoading,
  marketResults,
}) => (
  <div className="space-y-6 max-w-7xl mx-auto">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Wholesale Electricity Market & Economic Dispatch
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Merit-order generation scheduling, gas pipeline indexing, and wholesale clearing price settlement.
        </p>
      </div>

      <button
        onClick={runMarketSimulation}
        disabled={marketLoading}
        className="flex items-center gap-2 rounded-xl bg-[#500b50] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#680f68] shadow-xs disabled:opacity-50 w-fit"
      >
        {marketLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        <span>Run Economic Dispatch</span>
      </button>
    </div>

    {/* 3 Parameter Cards */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      {/* 1. Gas Tariff Factor */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Fuel className="h-4 w-4 text-[#500b50]" />
            <span>Gas Fuel Tariff</span>
          </span>
          <span className="text-base font-mono font-bold text-[#500b50]">
            {(gasPriceFactor * 100).toFixed(0)}%
          </span>
        </div>
        <input
          type="range"
          min="0.7"
          max="2.0"
          step="0.1"
          value={gasPriceFactor}
          onChange={(e) => setGasPriceFactor(parseFloat(e.target.value))}
          className="w-full accent-[#500b50] cursor-pointer"
        />
        <span className="text-xs text-slate-400 block">Escravos-Lagos pipeline pricing index</span>
      </div>

      {/* 2. Hydro Availability */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Droplet className="h-4 w-4 text-emerald-600" />
            <span>Hydro Reservoir Head</span>
          </span>
          <span className="text-sm font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
            {hydroAvailability >= 0.9 ? 'Wet Peak (100%)' : 'Dry Season (60%)'}
          </span>
        </div>
        <input
          type="range"
          min="0.5"
          max="1.0"
          step="0.1"
          value={hydroAvailability}
          onChange={(e) => setHydroAvailability(parseFloat(e.target.value))}
          className="w-full accent-emerald-600 cursor-pointer"
        />
        <span className="text-xs text-slate-400 block">Kainji, Jebba & Shiroro water inflow level</span>
      </div>

      {/* 3. Market Clearing Price */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
          Market Clearing Price
        </span>
        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-3xl font-mono font-black text-[#500b50]">
            ₦{marketResults?.market_clearing_price_ngn?.toLocaleString() || '--'}
          </span>
          <span className="text-sm font-semibold text-slate-500">/ MWh</span>
        </div>
        <span className="text-xs text-slate-400 block pt-1">Wholesale marginal unit settlement rate</span>
      </div>
    </div>

    {/* Merit Order Table */}
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
      <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
        <span>Merit Order Generation Dispatch Stack</span>
        <div className="flex items-center gap-4 text-xs font-mono font-semibold">
          <span>Hydro: {marketResults?.hydro_share_percent || 0}%</span>
          <span>Thermal: {marketResults?.thermal_share_percent || 0}%</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[700px]">
          <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
            <tr>
              <th className="py-3 px-4">Rank</th>
              <th className="py-3 px-4">Generating Station</th>
              <th className="py-3 px-4">Primary Fuel</th>
              <th className="py-3 px-4">Marginal Cost</th>
              <th className="py-3 px-4">Dispatched Output</th>
              <th className="py-3 px-4">Capacity Max</th>
              <th className="py-3 px-4">Hourly Cost (₦)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {marketResults?.merit_order?.map((gen, idx) => (
              <tr key={gen.name} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-mono text-slate-400 font-bold">#{idx + 1}</td>
                <td className="py-3 px-4 font-bold text-slate-900">{gen.name}</td>
                <td className="py-3 px-4">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                    gen.type === 'Hydro' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {gen.type}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono font-bold text-[#500b50]">
                  ₦{gen.marginal_cost.toLocaleString()}
                </td>
                <td className="py-3 px-4 font-mono font-bold text-slate-900">{gen.dispatched_mw} MW</td>
                <td className="py-3 px-4 font-mono text-slate-500">{gen.max_mw} MW</td>
                <td className="py-3 px-4 font-mono text-slate-900">
                  ₦{gen.hourly_cost_ngn.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);