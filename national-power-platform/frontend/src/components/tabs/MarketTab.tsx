'use client';

import React, { useState, useMemo } from 'react';
import { BusData, LineData } from '@/types/grid';
import {
  DollarSign,
  TrendingUp,
  AlertOctagon,
  BarChart3,
  Download,
  Filter,
} from 'lucide-react';

interface Props {
  buses: BusData[];
  lines: LineData[];
  modelName: string;
}

interface PlantDispatch {
  id: number;
  name: string;
  busId: number;
  type: string;
  capacityMw: number;
  dispatchedMw: number;
  marginalCost: number;
  revenue: number;
}

export const MarketTab: React.FC<Props> = ({ buses = [], lines = [], modelName }) => {
  const [gasPriceUsd, setGasPriceUsd] = useState<number>(3.5);
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [searchFilter, setSearchFilter] = useState('');

  const fxRate = 1450; // NGN per USD

  // Derive generators dynamically from negative active power buses
  const generatorBuses = useMemo(() => {
    return buses.filter(
      (b) =>
        (b.p_mw && b.p_mw < -15) ||
        b.name.toLowerCase().includes('gs') ||
        b.name.toLowerCase().includes('ps') ||
        b.name.toLowerCase().includes('slack')
    );
  }, [buses]);

  // Nodal LMP Formulation: Base Reference Marginal Energy + Loss Factor + Congestion Shadow Price
  const marketNodes = useMemo(() => {
    const baseEnergyPriceUsd = 28.5 + gasPriceUsd * 4.2;

    return buses.map((bus) => {
      const angle = bus.va_deg ?? 0.0;
      const vPu = bus.v_pu ?? 1.0;

      // Loss component derived from bus voltage angle displacement
      const lossComponentUsd = (angle / 18.0) * 1.8;

      // Congestion component driven by connection to heavily loaded lines
      const incidentLines = lines.filter((l) => l.from_bus === bus.id || l.to_bus === bus.id);
      const maxIncidentLoad = incidentLines.reduce((acc, l) => Math.max(acc, l.loading_percent ?? 0), 0);
      const congestionComponentUsd = maxIncidentLoad > 95 ? (maxIncidentLoad - 95) * 1.4 : 0.0;

      const totalLmpUsd = Math.max(15.0, baseEnergyPriceUsd + lossComponentUsd + congestionComponentUsd);
      const totalLmpNgn = totalLmpUsd * fxRate;

      return {
        id: bus.id,
        name: bus.name,
        zone: bus.zone || 'Grid Zone',
        vPu,
        angle,
        lmpUsd: Number(totalLmpUsd.toFixed(2)),
        lmpNgn: Number(totalLmpNgn.toFixed(0)),
        energyComp: Number(baseEnergyPriceUsd.toFixed(2)),
        lossComp: Number(lossComponentUsd.toFixed(2)),
        congestionComp: Number(congestionComponentUsd.toFixed(2)),
        isCongested: congestionComponentUsd > 0.01,
      };
    });
  }, [buses, lines, gasPriceUsd, fxRate]);

  // Merit-Order Economic Dispatch Stack
  const plantDispatchList: PlantDispatch[] = useMemo(() => {
    return generatorBuses.map((gen, idx) => {
      const isHydro =
        gen.name.toLowerCase().includes('kainji') ||
        gen.name.toLowerCase().includes('jebba') ||
        gen.name.toLowerCase().includes('shiroro') ||
        gen.name.toLowerCase().includes('hydro');

      const isSlack = gen.name.toLowerCase().includes('slack') || idx === 0;

      const baseHeatRate = isHydro ? 8.5 : isSlack ? 34.0 : 42.0 + (idx % 4) * 3.5;
      const marginalCostUsd = isHydro ? 9.5 : baseHeatRate + gasPriceUsd * 2.8;
      const capMw = Math.max(250, Math.abs(gen.p_mw ?? 0) * 1.25);
      const dispMw = Math.abs(gen.p_mw ?? 0);

      return {
        id: gen.id,
        name: gen.name,
        busId: gen.id,
        type: isHydro ? 'Hydro' : 'Gas Thermal',
        capacityMw: Math.round(capMw),
        dispatchedMw: Math.round(dispMw),
        marginalCost: Number(marginalCostUsd.toFixed(2)),
        revenue: Math.round(dispMw * marginalCostUsd * fxRate),
      };
    }).sort((a, b) => a.marginalCost - b.marginalCost);
  }, [generatorBuses, gasPriceUsd, fxRate]);

  // Congested Transmission Corridors
  const congestedLines = useMemo(() => {
    return lines
      .filter((l) => (l.loading_percent ?? 0) >= 85)
      .sort((a, b) => (b.loading_percent ?? 0) - (a.loading_percent ?? 0));
  }, [lines]);

  const filteredNodes = marketNodes.filter((node) =>
    node.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    node.zone.toLowerCase().includes(searchFilter.toLowerCase()) ||
    String(node.id).includes(searchFilter)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-2">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Market Simulations &amp; Nodal LMP Clearing
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-[#500b50] border border-purple-200">
              Security-Constrained OPF
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Locational Marginal Prices (LMP), congestion rent shadow costs, and generator merit-order dispatch.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-xs">
            <button
              onClick={() => setCurrency('NGN')}
              className={`px-3 py-1.5 rounded-lg transition ${
                currency === 'NGN' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ₦ NGN/MWh
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1.5 rounded-lg transition ${
                currency === 'USD' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              $ USD/MWh
            </button>
          </div>
        </div>
      </div>

      {/* Fuel Price & Economic Sensitivity Control */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Market Sensitivity Variables
          </span>
          <span className="text-xs font-mono text-slate-500 font-bold">
            FX Benchmark: ₦{fxRate.toLocaleString()} / USD
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Natural Gas Price ($/MMBtu)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.25"
                min="1.5"
                max="12.0"
                value={gasPriceUsd}
                onChange={(e) => setGasPriceUsd(parseFloat(e.target.value) || 3.5)}
                className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:border-[#500b50] focus:outline-none"
              />
              <span className="text-xs text-slate-500 font-mono font-bold">USD</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
            <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Average Grid Clearing Price
            </span>
            <div className="text-xl font-mono font-black text-slate-900 mt-0.5">
              {currency === 'NGN'
                ? `₦${(marketNodes.reduce((a, b) => a + b.lmpNgn, 0) / (marketNodes.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : `$${(marketNodes.reduce((a, b) => a + b.lmpUsd, 0) / (marketNodes.length || 1)).toFixed(2)}`}
              <span className="text-xs font-normal text-slate-400"> /MWh</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
            <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Congested Corridors
            </span>
            <div className="text-xl font-mono font-black text-amber-600 mt-0.5">
              {congestedLines.length} <span className="text-xs font-normal text-slate-400">Bottlenecks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Generator Merit-Order Supply Stack */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
          <span>Merit-Order Economic Dispatch Stack ({plantDispatchList.length} Generating Stations)</span>
          <span className="font-normal text-xs text-white/80">Ranked by marginal production cost</span>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Merit Rank</th>
                <th className="py-2.5 px-4">Station Name</th>
                <th className="py-2.5 px-4">Prime Mover</th>
                <th className="py-2.5 px-4">Marginal Cost</th>
                <th className="py-2.5 px-4">Dispatched Output</th>
                <th className="py-2.5 px-4">Total Capacity</th>
                <th className="py-2.5 px-4 text-right">Settlement Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
              {plantDispatchList.map((plant, idx) => (
                <tr key={plant.id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-4 font-bold text-slate-400">#{idx + 1}</td>
                  <td className="py-2.5 px-4 font-sans font-bold text-slate-900">{plant.name}</td>
                  <td className="py-2.5 px-4 font-sans">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      plant.type === 'Hydro' ? 'bg-cyan-100 text-cyan-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {plant.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">
                    {currency === 'NGN'
                      ? `₦${(plant.marginalCost * fxRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : `$${plant.marginalCost.toFixed(2)}`}{' '}
                    <span className="text-[10px] text-slate-400">/MWh</span>
                  </td>
                  <td className="py-2.5 px-4 font-bold text-emerald-700">{plant.dispatchedMw} MW</td>
                  <td className="py-2.5 px-4 text-slate-500">{plant.capacityMw} MW</td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                    {currency === 'NGN'
                      ? `₦${plant.revenue.toLocaleString()}`
                      : `$${Math.round(plant.revenue / fxRate).toLocaleString()}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nodal LMP Decomposition Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="bg-slate-900 text-white px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm font-bold">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            <span>Nodal LMP Decomposition ({filteredNodes.length} Substation Buses)</span>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search bus or zone..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="bg-white/10 text-white placeholder-white/50 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:bg-white focus:text-slate-900 w-52"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs min-w-[750px]">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Bus ID</th>
                <th className="py-2.5 px-4">Substation Node</th>
                <th className="py-2.5 px-4">Zone</th>
                <th className="py-2.5 px-4">Clearing LMP</th>
                <th className="py-2.5 px-4">Energy Component</th>
                <th className="py-2.5 px-4">Loss Component</th>
                <th className="py-2.5 px-4">Congestion Surcharge</th>
                <th className="py-2.5 px-4 text-right">Congestion Alert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
              {filteredNodes.map((node) => (
                <tr key={node.id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-4 font-bold text-slate-400">#{node.id}</td>
                  <td className="py-2.5 px-4 font-sans font-bold text-slate-900">{node.name}</td>
                  <td className="py-2.5 px-4 font-sans text-slate-500">{node.zone}</td>
                  <td className="py-2.5 px-4 font-bold text-[#500b50]">
                    {currency === 'NGN' ? `₦${node.lmpNgn.toLocaleString()}` : `$${node.lmpUsd.toFixed(2)}`}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {currency === 'NGN'
                      ? `₦${(node.energyComp * fxRate).toFixed(0)}`
                      : `$${node.energyComp.toFixed(2)}`}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {currency === 'NGN'
                      ? `₦${(node.lossComp * fxRate).toFixed(0)}`
                      : `$${node.lossComp.toFixed(2)}`}
                  </td>
                  <td className={`py-2.5 px-4 font-bold ${node.congestionComp > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {currency === 'NGN'
                      ? `₦${(node.congestionComp * fxRate).toFixed(0)}`
                      : `$${node.congestionComp.toFixed(2)}`}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {node.isCongested ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        Congested Branch
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Unconstrained
                      </span>
                    )}
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