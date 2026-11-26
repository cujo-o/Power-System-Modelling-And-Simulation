'use client';

import React, { useState, useMemo } from 'react';
import { X, Droplets, Flame, Sun } from 'lucide-react';
import {
  BusData,
  LineData,
  BusOverride,
  LineOverride,
  GeneratorOverride,
  LoadOverride,
  ExtendedPowerFlowVariables,
} from '@/types/grid';

export type EditingTarget =
  | { kind: 'bus'; bus: BusData }
  | { kind: 'line'; line: LineData }
  | { kind: 'generator'; bus: BusData }
  | { kind: 'load'; bus: BusData }
  | null;

interface ElementPropertyModalProps {
  target: EditingTarget;
  pfVariables: ExtendedPowerFlowVariables;
  onClose: () => void;
  onApply: (updater: (prev: ExtendedPowerFlowVariables) => ExtendedPowerFlowVariables) => void;
}

export const ElementPropertyModal: React.FC<ElementPropertyModalProps> = ({
  target,
  pfVariables,
  onClose,
  onApply,
}) => {
  if (!target) return null;
  const targetKey = `${target.kind}-${target.kind === 'line' ? target.line.id : target.bus.id}`;
  return (
    <ElementPropertyForm
      key={targetKey}
      target={target}
      pfVariables={pfVariables}
      onClose={onClose}
      onApply={onApply}
    />
  );
};

interface ElementPropertyFormProps {
  target: NonNullable<EditingTarget>;
  pfVariables: ExtendedPowerFlowVariables;
  onClose: () => void;
  onApply: (updater: (prev: ExtendedPowerFlowVariables) => ExtendedPowerFlowVariables) => void;
}

const ElementPropertyForm: React.FC<ElementPropertyFormProps> = ({
  target,
  pfVariables,
  onClose,
  onApply,
}) => {
  const busOvr = target.kind === 'bus' ? pfVariables.busOverrides?.[target.bus.id] : undefined;
  const lineOvr = target.kind === 'line' ? pfVariables.lineOverrides?.[target.line.id] : undefined;
  const genOvr =
    target.kind === 'generator' ? pfVariables.generatorOverrides?.[target.bus.id] : undefined;
  const loadOvr = target.kind === 'load' ? pfVariables.loadOverrides?.[target.bus.id] : undefined;

  const isHydroDefault =
    target.kind === 'generator' && /kainji|jebba|shiroro|zungeru|hydro/i.test(target.bus.name || '');
  const baseGenP =
    target.kind === 'generator' ? Math.max(25, Math.abs(target.bus.p_mw || 150)) : 150;
  const derivedLineRating =
    target.kind === 'line' && target.line.max_i_ka
      ? Math.round(target.line.max_i_ka * Math.sqrt(3) * 330)
      : 550;

  const [editName, setEditName] = useState(
    target.kind === 'bus'
      ? busOvr?.name ?? target.bus.name
      : target.kind === 'line'
      ? lineOvr?.name ?? target.line.name
      : target.kind === 'generator'
      ? genOvr?.name ?? target.bus.name
      : loadOvr?.name ?? target.bus.name
  );
  const [editKv, setEditKv] = useState(
    target.kind === 'bus' ? busOvr?.vn_kv ?? target.bus.vn_kv ?? 330 : 330
  );
  const [editZone, setEditZone] = useState(
    target.kind === 'bus' ? busOvr?.zone ?? target.bus.zone ?? 'Transmission' : 'Transmission'
  );
  const [editVmSetpoint, setEditVmSetpoint] = useState(
    target.kind === 'bus'
      ? busOvr?.v_pu_setpoint ?? target.bus.v_pu ?? 1.0
      : target.kind === 'generator'
      ? genOvr?.vmPu ?? target.bus.v_pu ?? 1.03
      : 1.02
  );
  const [editShuntMvar, setEditShuntMvar] = useState(busOvr?.shunt_mvar ?? 0);

  const [editLineLength, setEditLineLength] = useState(
    target.kind === 'line' ? lineOvr?.length_km ?? target.line.length_km ?? 65 : 50
  );
  const [editLineR, setEditLineR] = useState(
    target.kind === 'line' ? lineOvr?.r_ohm_per_km ?? target.line.r_ohm_per_km ?? 0.035 : 0.035
  );
  const [editLineX, setEditLineX] = useState(
    target.kind === 'line' ? lineOvr?.x_ohm_per_km ?? target.line.x_ohm_per_km ?? 0.32 : 0.32
  );
  const [editLineRatingMw, setEditLineRatingMw] = useState(
    lineOvr?.thermal_rating_mw ?? derivedLineRating
  );

  const [editPrimeMover, setEditPrimeMover] = useState<GeneratorOverride['primeMover']>(
    genOvr?.primeMover ?? (isHydroDefault ? 'Hydro' : 'Thermal (Gas)')
  );
  const [editRatedMw, setEditRatedMw] = useState(genOvr?.ratedMw ?? Math.round(baseGenP * 1.35));
  const [editActiveMw, setEditActiveMw] = useState(genOvr?.activeMw ?? Math.round(baseGenP));
  const [editNetHead, setEditNetHead] = useState(genOvr?.netHeadM ?? 92);
  const [editTurbineEff, setEditTurbineEff] = useState(genOvr?.turbineEfficiency ?? 90);
  const [editWaterIntake, setEditWaterIntake] = useState(
    genOvr?.waterIntakeM3s ?? Math.round((baseGenP * 1000) / (0.9 * 9.81 * 92))
  );
  const [editGasPressure, setEditGasPressure] = useState(genOvr?.gasPressureBar ?? 45);
  const [editAmbientTemp, setEditAmbientTemp] = useState(genOvr?.ambientTempC ?? 31);
  const [editIrradiance, setEditIrradiance] = useState(genOvr?.irradianceWm2 ?? 900);
  const [editCloudCover, setEditCloudCover] = useState(genOvr?.cloudCoverPct ?? 10);
  const [editInertiaH, setEditInertiaH] = useState(genOvr?.inertiaH ?? (isHydroDefault ? 5.2 : 4.0));
  const [editDroopPct, setEditDroopPct] = useState(genOvr?.droopPercent ?? 4.0);

  const [editLoadPMw, setEditLoadPMw] = useState(
    target.kind === 'load' ? loadOvr?.pMw ?? Math.max(5, Math.abs(target.bus.p_mw || 40)) : 60
  );
  const [editLoadQMvar, setEditLoadQMvar] = useState(
    target.kind === 'load' ? loadOvr?.qMvar ?? Math.round(target.bus.q_mvar || 18) : 25
  );
  const [editCritInfra, setEditCritInfra] = useState<
    NonNullable<LoadOverride['criticalInfrastructure']>
  >(loadOvr?.criticalInfrastructure ?? 'Standard Bulk Load');
  const [editUflsProtected, setEditUflsProtected] = useState(loadOvr?.uflsProtected ?? false);

  const computedHydroMw = useMemo(() => {
    const eff = editTurbineEff / 100;
    return Number(((eff * 9.81 * editNetHead * editWaterIntake) / 1000).toFixed(1));
  }, [editTurbineEff, editNetHead, editWaterIntake]);

  const handleSave = () => {
    if (target.kind === 'bus') {
      const bId = target.bus.id;
      const nextOvr: BusOverride = {
        name: editName.trim(),
        vn_kv: editKv,
        zone: editZone.trim(),
        v_pu_setpoint: editVmSetpoint,
        shunt_mvar: editShuntMvar,
      };
      onApply((prev) => ({
        ...prev,
        busOverrides: { ...(prev.busOverrides || {}), [bId]: nextOvr },
      }));
    } else if (target.kind === 'line') {
      const lId = target.line.id;
      const nextOvr: LineOverride = {
        name: editName.trim(),
        length_km: editLineLength,
        r_ohm_per_km: editLineR,
        x_ohm_per_km: editLineX,
        thermal_rating_mw: editLineRatingMw,
      };
      onApply((prev) => ({
        ...prev,
        lineOverrides: { ...(prev.lineOverrides || {}), [lId]: nextOvr },
      }));
    } else if (target.kind === 'generator') {
      const bId = target.bus.id;
      const nextOvr: GeneratorOverride = {
        busId: bId,
        name: editName.trim(),
        primeMover: editPrimeMover,
        ratedMw: editRatedMw,
        activeMw: editPrimeMover === 'Hydro' ? computedHydroMw : editActiveMw,
        vmPu: editVmSetpoint,
        waterIntakeM3s: editWaterIntake,
        netHeadM: editNetHead,
        turbineEfficiency: editTurbineEff,
        gasPressureBar: editGasPressure,
        ambientTempC: editAmbientTemp,
        irradianceWm2: editIrradiance,
        cloudCoverPct: editCloudCover,
        inertiaH: editInertiaH,
        droopPercent: editDroopPct,
        inService: true,
      };
      onApply((prev) => ({
        ...prev,
        generatorOverrides: { ...(prev.generatorOverrides || {}), [bId]: nextOvr },
      }));
    } else if (target.kind === 'load') {
      const bId = target.bus.id;
      const nextOvr: LoadOverride = {
        busId: bId,
        name: editName.trim(),
        pMw: editLoadPMw,
        qMvar: editLoadQMvar,
        criticalInfrastructure: editCritInfra,
        uflsProtected: editUflsProtected,
        inService: true,
      };
      onApply((prev) => ({
        ...prev,
        loadOverrides: { ...(prev.loadOverrides || {}), [bId]: nextOvr },
      }));
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div>
            <span className="text-[10px] font-mono uppercase font-bold text-[#500b50] block">
              Static &amp; Dynamic Property Editor
            </span>
            <h3 className="font-black text-sm text-slate-900">
              {target.kind === 'bus' && `Edit Substation #${target.bus.id}`}
              {target.kind === 'line' && `Edit Transmission Line #${target.line.id}`}
              {target.kind === 'generator' && `Edit Generating Unit @ Bus #${target.bus.id}`}
              {target.kind === 'load' && `Edit Load & Infrastructure @ Bus #${target.bus.id}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {target.kind === 'bus' && (
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Substation Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nominal Voltage (kV)</label>
                  <input
                    type="number"
                    value={editKv}
                    onChange={(e) => setEditKv(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Grid Zone</label>
                  <input
                    type="text"
                    value={editZone}
                    onChange={(e) => setEditZone(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Voltage Setpoint (pu)</label>
                  <input
                    type="number"
                    step="0.005"
                    min="0.85"
                    max="1.15"
                    value={editVmSetpoint}
                    onChange={(e) => setEditVmSetpoint(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Local Shunt Bank (MVAR)</label>
                  <input
                    type="number"
                    step="10"
                    value={editShuntMvar}
                    onChange={(e) => setEditShuntMvar(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {target.kind === 'line' && (
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Corridor Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Line Length (km)</label>
                  <input
                    type="number"
                    min="1"
                    value={editLineLength}
                    onChange={(e) => setEditLineLength(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Thermal Rating (MW)</label>
                  <input
                    type="number"
                    min="20"
                    value={editLineRatingMw}
                    onChange={(e) => setEditLineRatingMw(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Series Resistance R (Ω/km)</label>
                  <input
                    type="number"
                    step="0.005"
                    value={editLineR}
                    onChange={(e) => setEditLineR(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Series Reactance X (Ω/km)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editLineX}
                    onChange={(e) => setEditLineX(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {target.kind === 'generator' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Station Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prime Mover</label>
                  <select
                    value={editPrimeMover}
                    onChange={(e) =>
                      setEditPrimeMover(e.target.value as GeneratorOverride['primeMover'])
                    }
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-bold"
                  >
                    <option value="Hydro">Hydro Turbine (Water Intake)</option>
                    <option value="Thermal (Gas)">Thermal Gas Turbine</option>
                    <option value="Solar / Distributed">Distributed Solar</option>
                    <option value="Synchronous">Standard Synchronous Gen</option>
                  </select>
                </div>
              </div>

              {editPrimeMover === 'Hydro' && (
                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-950 flex items-center gap-1.5">
                      <Droplets className="h-4 w-4 text-blue-600" />
                      <span>Hydraulic Intake &amp; Net Head</span>
                    </span>
                    <span className="font-mono font-black text-xs text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                      P = {computedHydroMw} MW
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-blue-900 mb-1">
                        Intake (m³/s)
                      </label>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        max="2000"
                        value={editWaterIntake}
                        onChange={(e) => setEditWaterIntake(Number(e.target.value))}
                        className="w-full border border-blue-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-blue-900 mb-1">
                        Net Head (m)
                      </label>
                      <input
                        type="number"
                        step="2"
                        min="10"
                        max="300"
                        value={editNetHead}
                        onChange={(e) => setEditNetHead(Number(e.target.value))}
                        className="w-full border border-blue-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-blue-900 mb-1">
                        Efficiency (%)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="50"
                        max="98"
                        value={editTurbineEff}
                        onChange={(e) => setEditTurbineEff(Number(e.target.value))}
                        className="w-full border border-blue-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editPrimeMover === 'Thermal (Gas)' && (
                <div className="p-3.5 rounded-xl border border-orange-200 bg-orange-50/60 space-y-3">
                  <span className="font-bold text-orange-950 flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-orange-600" />
                    <span>Gas Supply &amp; Ambient Thermal Derating</span>
                  </span>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-orange-900 mb-1">
                        Gas Pressure (bar)
                      </label>
                      <input
                        type="number"
                        step="2"
                        min="0"
                        max="65"
                        value={editGasPressure}
                        onChange={(e) => setEditGasPressure(Number(e.target.value))}
                        className="w-full border border-orange-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-orange-900 mb-1">
                        Ambient Temp (°C)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="15"
                        max="50"
                        value={editAmbientTemp}
                        onChange={(e) => setEditAmbientTemp(Number(e.target.value))}
                        className="w-full border border-orange-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-orange-900 mb-1">
                        Rated Cap (MW)
                      </label>
                      <input
                        type="number"
                        step="25"
                        value={editRatedMw}
                        onChange={(e) => setEditRatedMw(Number(e.target.value))}
                        className="w-full border border-orange-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editPrimeMover === 'Solar / Distributed' && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                  <span className="font-bold text-amber-950 flex items-center gap-1.5">
                    <Sun className="h-4 w-4 text-amber-600" />
                    <span>Solar Irradiance &amp; Cloud Attenuation</span>
                  </span>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        Irradiance (W/m²)
                      </label>
                      <input
                        type="number"
                        step="50"
                        min="0"
                        max="1200"
                        value={editIrradiance}
                        onChange={(e) => setEditIrradiance(Number(e.target.value))}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        Cloud Cover (%)
                      </label>
                      <input
                        type="number"
                        step="5"
                        min="0"
                        max="95"
                        value={editCloudCover}
                        onChange={(e) => setEditCloudCover(Number(e.target.value))}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        Array Cap (MW)
                      </label>
                      <input
                        type="number"
                        step="10"
                        value={editRatedMw}
                        onChange={(e) => setEditRatedMw(Number(e.target.value))}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editPrimeMover === 'Synchronous' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Active Dispatch (MW)</label>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      value={editActiveMw}
                      onChange={(e) => setEditActiveMw(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Rated Capacity (MW)</label>
                    <input
                      type="number"
                      step="25"
                      min="10"
                      value={editRatedMw}
                      onChange={(e) => setEditRatedMw(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inertia H (s)</label>
                  <input
                    type="number"
                    step="0.2"
                    min="0.5"
                    max="12.0"
                    value={editInertiaH}
                    onChange={(e) => setEditInertiaH(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Governor Droop R (%)</label>
                  <input
                    type="number"
                    step="0.2"
                    min="1.5"
                    max="10.0"
                    value={editDroopPct}
                    onChange={(e) => setEditDroopPct(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Terminal V (pu)</label>
                  <input
                    type="number"
                    step="0.005"
                    min="0.95"
                    max="1.10"
                    value={editVmSetpoint}
                    onChange={(e) => setEditVmSetpoint(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {target.kind === 'load' && (
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Load Center Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Active Demand P (MW)</label>
                  <input
                    type="number"
                    step="5"
                    min="0"
                    value={editLoadPMw}
                    onChange={(e) => setEditLoadPMw(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reactive Demand Q (MVAR)</label>
                  <input
                    type="number"
                    step="5"
                    value={editLoadQMvar}
                    onChange={(e) => setEditLoadQMvar(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Critical Infrastructure Sector
                </label>
                <select
                  value={editCritInfra}
                  onChange={(e) =>
                    setEditCritInfra(
                      e.target.value as NonNullable<LoadOverride['criticalInfrastructure']>
                    )
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
                >
                  <option value="Standard Bulk Load">Standard Bulk Distribution Load</option>
                  <option value="Water Treatment & Pumping">Water Treatment &amp; Municipal Pumping</option>
                  <option value="Regional Hospital Cluster">Regional Hospital &amp; Emergency Cluster</option>
                  <option value="Telecom & SCADA Hub">Telecommunications &amp; Fiber Backhaul Hub</option>
                  <option value="Industrial Corridor">Industrial Manufacturing Corridor</option>
                </select>
              </div>
              <label className="flex items-center gap-2 pt-1 cursor-pointer font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={editUflsProtected}
                  onChange={(e) => setEditUflsProtected(e.target.checked)}
                  className="accent-[#500b50]"
                />
                <span>Exempt from Automatic Under-Frequency Load Shedding (Priority Feeder)</span>
              </label>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-[#500b50] hover:bg-[#680f68] text-white font-bold"
            >
              Apply &amp; Re-Solve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
