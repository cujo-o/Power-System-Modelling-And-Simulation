'use client';

import React, { useMemo } from 'react';
import { Printer, Download } from 'lucide-react';
import { BusData, LineData, GridModelMeta } from '@/types/grid';

interface ReportsTabProps {
  buses: BusData[];
  lines: LineData[];
  activeModel: GridModelMeta | null;
  trippedLines: number[];
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  buses = [],
  lines = [],
  activeModel,
  trippedLines = [],
}) => {
  // Statutory Nigerian Grid Code voltage envelope: 0.95 – 1.05 pu
  const voltageAudit = useMemo(() => {
    const violations: { bus: BusData; type: 'UNDERVOLTAGE' | 'OVERVOLTAGE'; deviation: number }[] = [];
    let compliant = 0;

    buses.forEach((b) => {
      const v = b.v_pu ?? 1.0;
      if (v < 0.95) {
        violations.push({ bus: b, type: 'UNDERVOLTAGE', deviation: Number((0.95 - v).toFixed(3)) });
      } else if (v > 1.05) {
        violations.push({ bus: b, type: 'OVERVOLTAGE', deviation: Number((v - 1.05).toFixed(3)) });
      } else {
        compliant++;
      }
    });

    return { compliant, violations };
  }, [buses]);

  // Continuous line thermal rating audit: <= 100%
  const thermalAudit = useMemo(() => {
    const overloads: LineData[] = [];
    lines.forEach((l) => {
      if ((l.loading_percent ?? 0) > 100) {
        overloads.push(l);
      }
    });
    return { critical: overloads.length, overloads };
  }, [lines]);

  const totalGenMw = useMemo(
    () => buses.reduce((acc, b) => (b.p_mw < 0 ? acc + Math.abs(b.p_mw) : acc), 0),
    [buses]
  );
  const totalLoadMw = useMemo(
    () => buses.reduce((acc, b) => (b.p_mw > 0 ? acc + b.p_mw : acc), 0),
    [buses]
  );
  const totalLossesMw = useMemo(
    () => lines.reduce((acc, l) => acc + (l.losses_mw ?? 0), 0),
    [lines]
  );

  const trippedSet = useMemo(() => new Set(trippedLines), [trippedLines]);
  const inServiceLinesCount = useMemo(
    () => lines.filter((l) => !trippedSet.has(l.id) && l.in_service !== false).length,
    [lines, trippedSet]
  );
  const trippedLinesCount = lines.length - inServiceLinesCount;

  const exportAuditCsv = () => {
    const rows = [
      'ELEMENT_TYPE,ID,IDENTIFIER,MEASURED_VALUE,STATUTORY_LIMIT,MARGIN,COMPLIANCE_STATUS',
    ];
    buses.forEach((b) => {
      const v = b.v_pu ?? 1.0;
      const status = v < 0.95 ? 'UNDERVOLTAGE' : v > 1.05 ? 'OVERVOLTAGE' : 'COMPLIANT';
      const margin = v < 0.95 ? (v - 0.95).toFixed(3) : v > 1.05 ? (v - 1.05).toFixed(3) : '0.000';
      rows.push(
        `BUS,${b.id},${escapeCsvCell(b.name)},${v.toFixed(3)} pu,0.950-1.050 pu,${margin},${status}`
      );
    });
    lines.forEach((l) => {
      const load = l.loading_percent ?? 0;
      const status = load > 100 ? 'OVERLOADED' : load >= 85 ? 'WARNING' : 'SECURE';
      rows.push(
        `LINE,${l.id},${escapeCsvCell(l.name)},${load.toFixed(1)}%,100.0%,${(100 - load).toFixed(1)}%,${status}`
      );
    });

    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Grid_Compliance_Audit_${activeModel?.name || 'NESI'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-2 text-slate-800">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              System Compliance &amp; Security Report
            </h2>
            {activeModel?.name && (
              <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold font-mono">
                {activeModel.name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Operating Envelope Audit • TCN Grid Code • IEEE Std 399
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Report</span>
          </button>
          <button
            onClick={exportAuditCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-xs font-semibold text-white transition shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV Audit</span>
          </button>
        </div>
      </div>

      {/* Audit Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Voltage Envelope (0.95–1.05 pu)
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {buses.length > 0 ? ((voltageAudit.compliant / buses.length) * 100).toFixed(1) : '0.0'}%
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5 font-sans">
            {voltageAudit.violations.length} voltage violations logged
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Corridor Thermal Security
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {lines.length > 0
              ? (((lines.length - thermalAudit.critical) / lines.length) * 100).toFixed(1)
              : '0.0'}
            %
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5 font-sans">
            {thermalAudit.critical} critical overloads (&gt;100%)
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Net Generation vs. Load
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {totalGenMw.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">MW</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5 font-sans">
            Load: {totalLoadMw.toFixed(1)} MW • Losses: {totalLossesMw.toFixed(1)} MW
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            N-1 Line Breaker Status
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {trippedLinesCount}{' '}
            <span className="text-xs font-normal text-slate-400">Tripped</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5 font-sans">
            {inServiceLinesCount} circuits in active service
          </span>
        </div>
      </div>

      {/* Bus Voltage Violation Log */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span>
            Bus Voltage Violation Log ({voltageAudit.violations.length} Nodes Outside 0.95–1.05 pu)
          </span>
          <span className="font-mono text-slate-400 lowercase font-normal">
            TCN Operating Code §4.2
          </span>
        </div>

        <div className="overflow-x-auto max-h-64 print:max-h-none">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Node ID</th>
                <th className="py-2.5 px-3">Substation</th>
                <th className="py-2.5 px-3">Zone</th>
                <th className="py-2.5 px-3">Voltage (|V|)</th>
                <th className="py-2.5 px-3">Deviation</th>
                <th className="py-2.5 px-3">Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {voltageAudit.violations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                    No voltage violations detected across active substation busbars.
                  </td>
                </tr>
              ) : (
                voltageAudit.violations.map(({ bus, type, deviation }) => (
                  <tr key={bus.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-400 font-bold">#{bus.id}</td>
                    <td className="py-2 px-3 font-sans font-bold text-slate-900">{bus.name}</td>
                    <td className="py-2 px-3 text-slate-500 font-sans">
                      {bus.zone || 'Transmission'}
                    </td>
                    <td className="py-2 px-3 font-bold text-rose-700">
                      {(bus.v_pu ?? 1.0).toFixed(3)} pu
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {type === 'UNDERVOLTAGE' ? '-' : '+'}
                      {deviation.toFixed(3)} pu
                    </td>
                    <td className="py-2 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                        {type}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Corridor Thermal Overload Log */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span>
            Corridor Thermal Overload Log ({thermalAudit.overloads.length} Circuits &gt;100%)
          </span>
          <span className="font-mono text-slate-400 lowercase font-normal">
            Continuous Rating MVA
          </span>
        </div>

        <div className="overflow-x-auto max-h-64 print:max-h-none">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Circuit ID</th>
                <th className="py-2.5 px-3">Corridor</th>
                <th className="py-2.5 px-3">Terminal Nodes</th>
                <th className="py-2.5 px-3">Flow (MW)</th>
                <th className="py-2.5 px-3">Loading (%)</th>
                <th className="py-2.5 px-3">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {thermalAudit.overloads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                    No thermal overloads detected across in-service transmission corridors.
                  </td>
                </tr>
              ) : (
                thermalAudit.overloads.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-400 font-bold">#{l.id}</td>
                    <td className="py-2 px-3 font-sans font-bold text-slate-900">{l.name}</td>
                    <td className="py-2 px-3 text-slate-500">
                      #{l.from_bus} → #{l.to_bus}
                    </td>
                    <td className="py-2 px-3 font-bold">
                      {(l.flow_mw ?? l.p_mw ?? 0).toFixed(1)} MW
                    </td>
                    <td className="py-2 px-3 font-bold text-rose-700">
                      {(l.loading_percent ?? 0).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-rose-600">
                      -{((l.loading_percent ?? 0) - 100).toFixed(1)}% deficit
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
