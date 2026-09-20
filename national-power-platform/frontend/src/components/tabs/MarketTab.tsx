'use client';
import React from 'react';
import { MarketResult } from '@/types/grid';
import { Play, RefreshCw } from 'lucide-react';

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
  <div className="space-y-6 max-w-6xl mx-auto">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-[#500b50]">Wholesale Electricity Market & Economic Dispatch</h2>
        <p className="text-xs text-slate-500">Merit-order generation scheduling and Locational Marginal Pricing (LMP).</p>
      </div>

      <button
        onClick={runMarketSimulation}
        disabled={marketLoading}
        className="flex items-center gap-1.5 rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs disabled:opacity-50 w-fit"
      >
        {marketLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        <span>Run Economic Dispatch</span>
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-slate-700">Gas Fuel Tariff Factor</span>
          <span className="text-xs font-mono font-bold text-[#500b50]">{(gasPriceFactor * 100).toFixed(0)}%</span>
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
        <span className="text-[10px] text-slate-400 mt-1.5 block">Pipeline gas pricing index</span>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-slate-700">Hydro Inflow Season</span>
          <span className="text-xs font-mono font-bold text-emerald-700">{hydroAvailability >= 0.9 ? 'Wet Peak (100%)' : 'Dry Lean (60%)'}</span>
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
        <span className="text-[10px] text-slate-400 mt-1.5 block">Kainji, Jebba & Shiroro reservoir water head</span>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs">
        <span className="text-xs font-semibold text-slate-700 mb-1 block">Market Clearing Price</span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-[#500b50]">
            ₦{marketResults?.market_clearing_price_ngn?.toLocaleString() || '--'}
          </span>
          <span className="text-xs text-slate-500">/ MWh</span>
        </div>
        <span className="text-[10px] text-slate-400 mt-1 block">Wholesale marginal unit settlement rate</span>
      </div>
    </div>

    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
      <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
        <span>Merit Order Generation Dispatch Stack</span>
        <div className="flex items-center gap-3 text-xs font-normal">
          <span>Hydro: {marketResults?.hydro_share_percent || 0}%</span>
          <span>Thermal: {marketResults?.thermal_share_percent || 0}%</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[650px]">
          <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="p-2.5">Rank</th>
              <th className="p-2.5">Generating Station</th>
              <th className="p-2.5">Primary Fuel</th>
              <th className="p-2.5">Marginal Cost</th>
              <th className="p-2.5">Dispatched (MW)</th>
              <th className="p-2.5">Capacity Max</th>
              <th className="p-2.5">Hourly Cost (₦)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {marketResults?.merit_order?.map((gen, idx) => (
              <tr key={gen.name} className="hover:bg-[#fcfaff]">
                <td className="p-2.5 font-mono text-slate-400 font-bold">#{idx + 1}</td>
                <td className="p-2.5 font-bold text-slate-900">{gen.name}</td>
                <td className="p-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    gen.type === 'Hydro' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {gen.type}
                  </span>
                </td>
                <td className="p-2.5 font-mono font-bold text-[#500b50]">₦{gen.marginal_cost.toLocaleString()}</td>
                <td className="p-2.5 font-mono font-bold text-slate-900">{gen.dispatched_mw} MW</td>
                <td className="p-2.5 font-mono text-slate-500">{gen.max_mw} MW</td>
                <td className="p-2.5 font-mono text-slate-900">₦{gen.hourly_cost_ngn.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);