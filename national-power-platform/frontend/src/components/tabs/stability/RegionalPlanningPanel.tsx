'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TooltipBadge } from '@/components/ui/TooltipBadge';
import {
  BusData,
  ExtendedPowerFlowVariables,
  NewBusElement,
  NewLineElement,
  NewGenElement,
} from '@/types/grid';

interface RegionalPlanningPanelProps {
  buses: BusData[];
  pfVariables: ExtendedPowerFlowVariables;
  totalSandboxModifications: number;
  setPfVariables: React.Dispatch<React.SetStateAction<ExtendedPowerFlowVariables>>;
  runSimulation: () => void;
  toggleBusService?: (busId: number) => void;
  onReset: () => void;
}

export const RegionalPlanningPanel: React.FC<RegionalPlanningPanelProps> = ({
  buses,
  pfVariables,
  totalSandboxModifications,
  setPfVariables,
  runSimulation,
  toggleBusService,
  onReset,
}) => {
  const resolveBus = (selected: number | null, fallbackIndex = 0) =>
    selected !== null && buses.some((b) => b.id === selected)
      ? selected
      : buses[fallbackIndex]?.id ?? buses[0]?.id ?? 1;

  // 1. Substation + Tie Line
  const [newSubName, setNewSubName] = useState('');
  const [newSubKv, setNewSubKv] = useState(330);
  const [newSubDemand, setNewSubDemand] = useState(45);
  const [rawConnectBus, setConnectToExistingBus] = useState<number | null>(null);
  const connectToExistingBus = resolveBus(rawConnectBus, 0);
  const [tieLengthKm, setTieLengthKm] = useState(55);

  // 2. Standalone Branch
  const [newLineName, setNewLineName] = useState('');
  const [rawLineFrom, setNewLineFrom] = useState<number | null>(null);
  const [rawLineTo, setNewLineTo] = useState<number | null>(null);
  const newLineFrom = resolveBus(rawLineFrom, 0);
  const newLineTo = resolveBus(rawLineTo, 1);
  const [newLineLength, setNewLineLength] = useState(65);
  const [newLineConductor, setNewLineConductor] = useState('Bison 330kV');

  // 3. Standalone Plant
  const [newGenName, setNewGenName] = useState('');
  const [rawGenBus, setNewGenBus] = useState<number | null>(null);
  const newGenBus = resolveBus(rawGenBus, 0);
  const [newGenP, setNewGenP] = useState(150);
  const [newGenVm, setNewGenVm] = useState(1.03);

  // 4. Node Isolation
  const [rawDecommissionBus, setSelectedDecommissionBus] = useState<number | null>(null);
  const selectedDecommissionBus = resolveBus(rawDecommissionBus, 0);

  const handleAddSubstation = () => {
    if (!newSubName.trim()) return;
    // Matches backend deterministic ID allocation: max(existing bus IDs) + 1
    const maxBusId = buses.reduce((maxId, b) => Math.max(maxId, b.id), 0);
    const assignedNewBusId = maxBusId + 1;
    const targetBus = buses.find((b) => b.id === connectToExistingBus);

    const newBusItem: NewBusElement = {
      name: newSubName.trim(),
      vn_kv: newSubKv,
      zone: targetBus?.zone || 'North-Central',
      p_mw: newSubDemand,
      q_mvar: Number((newSubDemand * 0.35).toFixed(1)),
    };
    const newLineItem: NewLineElement = {
      name: `${targetBus?.name || 'Bus'}-${newSubName.trim()}`,
      from_bus: connectToExistingBus,
      to_bus: assignedNewBusId,
      length_km: tieLengthKm,
      conductor_type: newSubKv >= 300 ? 'Bison 330kV' : 'Panther 132kV',
      vn_kv: newSubKv,
    };

    setPfVariables((prev) => ({
      ...prev,
      newBuses: [...prev.newBuses, newBusItem],
      newLines: [...prev.newLines, newLineItem],
    }));
    setNewSubName('');
    setTimeout(() => runSimulation(), 60);
  };

  const handleAddLine = () => {
    if (!newLineName.trim() || newLineFrom === newLineTo) return;
    const item: NewLineElement = {
      name: newLineName.trim(),
      from_bus: newLineFrom,
      to_bus: newLineTo,
      length_km: newLineLength,
      conductor_type: newLineConductor,
      vn_kv: newLineConductor.includes('330') ? 330 : 132,
    };
    setPfVariables((prev) => ({ ...prev, newLines: [...prev.newLines, item] }));
    setNewLineName('');
    setTimeout(() => runSimulation(), 60);
  };

  const handleAddGen = () => {
    if (!newGenName.trim()) return;
    const item: NewGenElement = {
      name: newGenName.trim(),
      bus: newGenBus,
      p_mw: newGenP,
      vm_pu: newGenVm,
      p_max_mw: Number((newGenP * 1.5).toFixed(1)),
    };
    setPfVariables((prev) => ({ ...prev, newGenerators: [...prev.newGenerators, item] }));
    setNewGenName('');
    setTimeout(() => runSimulation(), 60);
  };

  return (
    <div className="space-y-4">
      {totalSandboxModifications > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-2">
          <span>
            <strong>{totalSandboxModifications} active sandbox modification(s)</strong> applied in memory (base model file is unchanged).
          </span>
          <button
            onClick={onReset}
            className="px-2.5 py-1 rounded bg-white border border-blue-300 text-blue-800 font-bold hover:bg-blue-100 shrink-0"
          >
            Clear Sandbox
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Propose Substation + Interconnection */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Plus className="h-4 w-4 text-[#500b50]" />
            <span>1. Propose Substation &amp; Interconnection</span>
          </h4>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Substation Name
                <TooltipBadge content="Identifier for the proposed substation node." />
              </label>
              <input
                type="text"
                placeholder="e.g. KUBWA 330"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Connect From Node
                <TooltipBadge content="Existing substation to interconnect via a new tie line." />
              </label>
              <select
                value={connectToExistingBus}
                onChange={(e) => setConnectToExistingBus(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id}: {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Voltage
                <TooltipBadge content="Operating voltage class of the proposed busbar." />
              </label>
              <select
                value={newSubKv}
                onChange={(e) => setNewSubKv(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white"
              >
                <option value={330}>330 kV Bulk</option>
                <option value={132}>132 kV Sub-T</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Length (km)
                <TooltipBadge content="Tie-line distance to the connecting substation." />
              </label>
              <input
                type="number"
                min="1"
                value={tieLengthKm}
                onChange={(e) => setTieLengthKm(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Load (MW)
                <TooltipBadge content="Planned active power load at this substation." />
              </label>
              <input
                type="number"
                min="0"
                value={newSubDemand}
                onChange={(e) => setNewSubDemand(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleAddSubstation}
            disabled={!newSubName.trim() || buses.length === 0}
            className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs transition disabled:opacity-50"
          >
            + Add Substation &amp; Interconnection
          </button>
        </div>

        {/* 2. Connect Independent Line Corridor */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Plus className="h-4 w-4 text-[#500b50]" />
            <span>2. Connect Independent Line Corridor</span>
          </h4>

          <div className="text-xs">
            <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
              Corridor Name
              <TooltipBadge content="Name of the new overhead transmission circuit." />
            </label>
            <input
              type="text"
              placeholder="e.g. MAKURDI - WUKARI"
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                From Bus
              </label>
              <select
                value={newLineFrom}
                onChange={(e) => setNewLineFrom(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id}: {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                To Bus
              </label>
              <select
                value={newLineTo}
                onChange={(e) => setNewLineTo(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id}: {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Length (km)
              </label>
              <input
                type="number"
                min="1"
                value={newLineLength}
                onChange={(e) => setNewLineLength(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Conductor
                <TooltipBadge content="ACSR conductor type setting per-km impedance and current rating." />
              </label>
              <select
                value={newLineConductor}
                onChange={(e) => setNewLineConductor(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                <option value="Bison 330kV">Bison 330kV</option>
                <option value="Bear 330kV">Bear 330kV</option>
                <option value="Panther 132kV">Panther 132kV</option>
                <option value="Bear 132kV">Bear 132kV</option>
                <option value="Wolf 132kV">Wolf 132kV</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleAddLine}
            disabled={!newLineName.trim() || newLineFrom === newLineTo || buses.length < 2}
            className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs transition disabled:opacity-50"
          >
            + Connect Line Corridor
          </button>
        </div>

        {/* 3. Propose Power Plant */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Plus className="h-4 w-4 text-[#500b50]" />
            <span>3. Propose Power Generation Plant</span>
          </h4>

          <div className="text-xs">
            <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
              Plant Name
            </label>
            <input
              type="text"
              placeholder="e.g. Kano Solar IPP"
              value={newGenName}
              onChange={(e) => setNewGenName(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Interconnection Node
              </label>
              <select
                value={newGenBus}
                onChange={(e) => setNewGenBus(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id}: {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Output (MW)
              </label>
              <input
                type="number"
                min="1"
                value={newGenP}
                onChange={(e) => setNewGenP(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center">
                Target (pu)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.95"
                max="1.10"
                value={newGenVm}
                onChange={(e) => setNewGenVm(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleAddGen}
            disabled={!newGenName.trim() || buses.length === 0}
            className="w-full py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white font-bold text-xs transition disabled:opacity-50"
          >
            + Add Generation Plant
          </button>
        </div>

        {/* 4. Node Decommissioning / Isolation */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Trash2 className="h-4 w-4 text-rose-600" />
            <span>4. Isolate / Decommission Node</span>
          </h4>

          <div className="text-xs space-y-2">
            <label className="text-[11px] font-bold text-slate-600 flex items-center">
              Select Substation to Isolate
              <TooltipBadge content="Isolate a substation and all incident lines to evaluate N-k node contingency survival." />
            </label>
            <div className="flex gap-2">
              <select
                value={selectedDecommissionBus}
                onChange={(e) => setSelectedDecommissionBus(Number(e.target.value))}
                className="flex-1 border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id}: {b.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => toggleBusService?.(selectedDecommissionBus)}
                disabled={buses.length === 0}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 disabled:opacity-50"
              >
                {pfVariables.disabledBuses?.includes(selectedDecommissionBus)
                  ? 'Restore Node'
                  : 'Isolate Node'}
              </button>
            </div>
          </div>

          {pfVariables.disabledBuses && pfVariables.disabledBuses.length > 0 && (
            <div className="pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Isolated Nodes ({pfVariables.disabledBuses.length})
              </span>
              <div className="flex flex-wrap gap-1">
                {pfVariables.disabledBuses.map((bId) => {
                  const busName = buses.find((b) => b.id === bId)?.name || `#${bId}`;
                  return (
                    <span
                      key={bId}
                      className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-mono font-bold flex items-center gap-1"
                    >
                      <span>{busName}</span>
                      <button
                        onClick={() => toggleBusService?.(bId)}
                        className="text-rose-500 hover:text-rose-900"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
