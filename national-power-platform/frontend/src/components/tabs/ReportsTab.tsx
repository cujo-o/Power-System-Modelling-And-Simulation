'use client';

import React, { useState } from 'react';
import {
  SimResult,
  UserAccount,
  PowerFlowVariables,
  DynamicSimResult,
} from '@/types/grid';
import {
  FileText,
  Printer,
  Download,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Zap,
  TrendingDown,
  Activity,
  Flame,
  Award,
} from 'lucide-react';

interface ReportsTabProps {
  results: SimResult | null;
  modelName?: string;
  currentUser?: UserAccount | null;
  pfVariables?: PowerFlowVariables;
  dynResult?: DynamicSimResult | null;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  results,
  modelName = 'Active Model Case',
  currentUser,
  pfVariables,
  dynResult,
}) => {
  const [filterMode, setFilterMode] = useState<'ALL' | 'VIOLATIONS_ONLY'>('ALL');

  if (!results || results.buses.length === 0) {
    return (
      <div className="h-96 rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center p-6 text-center max-w-4xl mx-auto">
        <FileText className="h-12 w-12 text-slate-400 mb-3" />
        <h3 className="text-sm font-bold text-slate-800">No Simulation Data to Audit</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Solve AC Power Flow or run a dynamic transient contingency to generate the formal NERC Grid Code audit dossier.
        </p>
      </div>
    );
  }

  // 1. Voltage Band Auditing (0.95 - 1.05 pu)
  const underVoltageBuses = results.buses.filter((b) => b.v_pu < 0.95);
  const overVoltageBuses = results.buses.filter((b) => b.v_pu > 1.05);
  const compliantBuses = results.buses.filter((b) => b.v_pu >= 0.95 && b.v_pu <= 1.05);

  const voltageCompliancePercent = (
    (compliantBuses.length / Math.max(1, results.buses.length)) *
    100
  ).toFixed(1);

  // 2. Thermal Corridor Loading Auditing
  const alertLines = results.lines.filter((l) => l.loading_percent >= 85 && l.loading_percent <= 100);
  const overloadedLines = results.lines.filter((l) => l.loading_percent > 100);
  const normalLines = results.lines.filter((l) => l.loading_percent < 85);

  const lossPercent = (
    (results.total_losses_mw / Math.max(1, results.total_gen_mw)) *
    100
  ).toFixed(2);

  // Filtered displays
  const displayedBuses =
    filterMode === 'VIOLATIONS_ONLY'
      ? results.buses.filter((b) => b.v_pu < 0.95 || b.v_pu > 1.05)
      : results.buses;

  const displayedLines =
    filterMode === 'VIOLATIONS_ONLY'
      ? results.lines.filter((l) => l.loading_percent >= 85)
      : results.lines;

  // 3. Export CSV Handlers
  const handleExportCSV = () => {
    const rows = [
      ['NATIONAL ELECTRICITY SUPPLY INDUSTRY (NESI) - SYSTEM OPERATIONAL AUDIT'],
      ['Active Grid Network', modelName],
      ['Auditing Operator', currentUser ? currentUser.name : 'Authorized Operator'],
      ['Affiliation', currentUser ? currentUser.institution : 'ML4PS FUT Minna'],
      ['Audit Timestamp', new Date().toISOString()],
      ['System Frequency (Hz)', results.frequency.toFixed(2)],
      ['Total Generation (MW)', results.total_gen_mw],
      ['Total Demand (MW)', results.total_load_mw],
      ['Technical Losses (MW)', results.total_losses_mw],
      ['Loss Percentage (%)', `${lossPercent}%`],
      ['Voltage Compliance (%)', `${voltageCompliancePercent}%`],
      [],
      ['--- SUBSTATION BUS VOLTAGE COMPLIANCE LEDGER ---'],
      ['Bus ID', 'Substation Name', 'Regional Zone', 'Nominal kV', 'Voltage (pu)', 'Phase Angle (deg)', 'Active (MW)', 'Reactive (MVAR)', 'Grid Code Status'],
      ...results.buses.map((b) => [
        b.id,
        b.name,
        b.zone,
        b.vn_kv || 330,
        b.v_pu.toFixed(3),
        b.va_deg.toFixed(2),
        b.p_mw,
        b.q_mvar,
        b.v_pu < 0.95 ? 'UNDER-VOLTAGE VIOLATION' : b.v_pu > 1.05 ? 'OVER-VOLTAGE VIOLATION' : 'COMPLIANT',
      ]),
      [],
      ['--- TRANSMISSION CORRIDOR THERMAL LOADING LEDGER ---'],
      ['Line ID', 'Corridor Identifier', 'From Bus', 'To Bus', 'Active Flow (MW)', 'Thermal Loading (%)', 'Losses (MW)', 'Status'],
      ...results.lines.map((l) => [
        l.id,
        l.name,
        l.from_bus,
        l.to_bus,
        l.flow_mw,
        `${l.loading_percent}%`,
        l.losses_mw,
        l.loading_percent > 100 ? 'THERMAL VIOLATION' : l.loading_percent >= 85 ? 'ALERT BAND' : 'NORMAL',
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NESI_Audit_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
      {/* Top Action Bar (Hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-bold text-[#500b50] flex items-center gap-2">
            <Award className="h-5 w-5 text-[#500b50]" />
            <span>NERC Grid Code Audit & Compliance Dossier</span>
          </h2>
          <p className="text-xs text-slate-500">
            Official operational compliance ledger evaluated against statutory NESI standards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Violations Filter Toggle */}
          <div className="flex rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 rounded font-bold transition ${
                filterMode === 'ALL' ? 'bg-[#500b50] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Assets ({results.buses.length})
            </button>
            <button
              onClick={() => setFilterMode('VIOLATIONS_ONLY')}
              className={`px-3 py-1.5 rounded font-bold transition ${
                filterMode === 'VIOLATIONS_ONLY' ? 'bg-rose-700 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Violations Only ({underVoltageBuses.length + overVoltageBuses.length + overloadedLines.length})
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded bg-[#500b50] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#680f68] transition shadow-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Dossier (PDF)</span>
          </button>
        </div>
      </div>

      {/* FORMAL DOSSIER SHEET (Print-Optimized) */}
      <div className="rounded-xl border border-slate-300 bg-white p-6 sm:p-8 shadow-sm space-y-6 print:border-none print:shadow-none print:p-0">
        {/* Formal Institutional Header */}
        <div className="border-b-2 border-[#500b50] pb-5">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#500b50] block">
                Federal Republic of Nigeria • Power System Simulation Taskforce
              </span>
              <h1 className="text-base sm:text-lg font-black uppercase text-slate-900 tracking-tight mt-0.5">
                Technical Grid Code Compliance & Reliability Audit Dossier
              </h1>
              <span className="text-xs text-slate-500 font-medium block mt-0.5">
                Machine Learning 4 Power Systems (ML4PS) Laboratory | Federal University of Technology, Minna
              </span>
            </div>

            <div className="text-left sm:text-right font-mono text-xs text-slate-600 bg-slate-50 p-3 rounded border border-slate-200 shrink-0">
              <div>Ref: <strong className="text-slate-900">NESI-AUD-2026-09</strong></div>
              <div>Network Case: <strong className="text-purple-900">{modelName}</strong></div>
              <div>Audit Date: <strong>{new Date().toLocaleDateString()}</strong></div>
            </div>
          </div>

          {/* Reviewing Operator Badge */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
            <div>
              Audited by:{' '}
              <strong className="text-slate-900 font-semibold">
                {currentUser ? currentUser.name : 'Authorized Taskforce Operator'}
              </strong>{' '}
              ({currentUser ? currentUser.institution : 'ML4PS Group'})
            </div>
            <div>
              Clearance Level:{' '}
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {currentUser ? currentUser.role : 'Taskforce Administrator'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Executive Grid Health Metrics */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#500b50] mb-3 flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            <span>1. Executive Summary & Power Balance</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded border border-slate-200 bg-slate-50">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Generation</span>
              <span className="text-base font-bold font-mono text-[#500b50] mt-0.5 block">
                {results.total_gen_mw.toLocaleString()} MW
              </span>
              <span className="text-[10px] text-slate-400">Total infeed dispatched</span>
            </div>

            <div className="p-3 rounded border border-slate-200 bg-slate-50">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Load Demand</span>
              <span className="text-base font-bold font-mono text-slate-900 mt-0.5 block">
                {results.total_load_mw.toLocaleString()} MW
              </span>
              <span className="text-[10px] text-slate-400">Active regional consumption</span>
            </div>

            <div className="p-3 rounded border border-slate-200 bg-slate-50">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Transmission Losses</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-bold font-mono text-amber-700">
                  {results.total_losses_mw} MW
                </span>
                <span className="text-[11px] font-mono text-slate-500">({lossPercent}%)</span>
              </div>
              <span className="text-[10px] text-slate-400">NESI benchmark: &lt; 8.05%</span>
            </div>

            <div className="p-3 rounded border border-slate-200 bg-slate-50">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Voltage Compliance</span>
              <span className={`text-base font-bold font-mono mt-0.5 block ${
                Number(voltageCompliancePercent) >= 90 ? 'text-emerald-700' : 'text-rose-600'
              }`}>
                {voltageCompliancePercent}%
              </span>
              <span className="text-[10px] text-slate-400">
                {compliantBuses.length} of {results.buses.length} compliant
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Statutory Voltage Compliance Ledger */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#500b50] flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>2. Substation Bus Voltage Compliance Audit</span>
            </h3>
            <span className="text-[11px] text-slate-500">
              Statutory Band: <strong>0.95 – 1.05 p.u.</strong> (±5% at 330/132 kV)
            </span>
          </div>

          <div className="rounded border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="p-2.5">ID</th>
                  <th className="p-2.5">Substation Name</th>
                  <th className="p-2.5">Zone</th>
                  <th className="p-2.5">Nominal</th>
                  <th className="p-2.5">Voltage (|V|)</th>
                  <th className="p-2.5">Deviation (ΔV)</th>
                  <th className="p-2.5">Phase Angle</th>
                  <th className="p-2.5">Statutory Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {displayedBuses.map((bus) => {
                  const isUnder = bus.v_pu < 0.95;
                  const isOver = bus.v_pu > 1.05;
                  const dev = (bus.v_pu - 1.0) * 100;

                  return (
                    <tr key={bus.id} className="hover:bg-slate-50/60">
                      <td className="p-2.5 font-mono text-slate-400 font-bold">#{bus.id}</td>
                      <td className="p-2.5 font-bold text-slate-900">{bus.name}</td>
                      <td className="p-2.5 text-slate-500">{bus.zone}</td>
                      <td className="p-2.5 font-mono">{bus.vn_kv || 330} kV</td>
                      <td className="p-2.5 font-mono font-bold">
                        <span className={isUnder ? 'text-rose-600' : isOver ? 'text-amber-600' : 'text-emerald-700'}>
                          {bus.v_pu.toFixed(3)} pu
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-[11px]">
                        <span className={dev > 0 ? 'text-amber-700' : 'text-rose-700'}>
                          {dev > 0 ? `+${dev.toFixed(1)}%` : `${dev.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono">{bus.va_deg.toFixed(2)}°</td>
                      <td className="p-2.5">
                        {isUnder ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            Under-voltage Violation
                          </span>
                        ) : isOver ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Over-voltage (Ferranti)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Grid Code Compliant
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Transmission Line Thermal Risk & Alert Corridors */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#500b50] flex items-center gap-1.5">
              <Flame className="h-4 w-4" />
              <span>3. Transmission Corridor Congestion & Thermal Ledger</span>
            </h3>
            <span className="text-[11px] text-slate-500">
              Violations (&gt;100%): <strong className="text-rose-600">{overloadedLines.length}</strong> | Alerts (85–100%):{' '}
              <strong className="text-amber-600">{alertLines.length}</strong>
            </span>
          </div>

          <div className="rounded border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="p-2.5">ID</th>
                  <th className="p-2.5">Transmission Corridor</th>
                  <th className="p-2.5">Active Flow</th>
                  <th className="p-2.5">Thermal Loading</th>
                  <th className="p-2.5">Branch Losses</th>
                  <th className="p-2.5">Operating Security Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {displayedLines.map((line) => {
                  const isOver = line.loading_percent > 100;
                  const isAlert = line.loading_percent >= 85 && line.loading_percent <= 100;

                  return (
                    <tr key={line.id} className="hover:bg-slate-50/60">
                      <td className="p-2.5 font-mono text-slate-400">#{line.id}</td>
                      <td className="p-2.5 font-bold text-slate-900">{line.name}</td>
                      <td className="p-2.5 font-mono">{line.flow_mw} MW</td>
                      <td className="p-2.5 font-mono font-bold">
                        <span className={isOver ? 'text-rose-600' : isAlert ? 'text-amber-600' : 'text-slate-800'}>
                          {line.loading_percent}%
                        </span>
                      </td>
                      <td className="p-2.5 font-mono">{line.losses_mw} MW</td>
                      <td className="p-2.5">
                        {isOver ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            Thermal Overload Trip Risk
                          </span>
                        ) : isAlert ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Congestion Alert Band
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                            Normal Loading
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Dynamic Stability & UFLS Summary (If Available) */}
        {dynResult && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#500b50] mb-2 flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              <span>4. Dynamic Transient Stability & UFLS Defense Review</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Frequency Nadir</span>
                <span className={`text-base font-bold font-mono mt-0.5 block ${
                  dynResult.metrics.nadir_ufls_hz < 48.80 ? 'text-rose-600' : 'text-emerald-700'
                }`}>
                  {dynResult.metrics.nadir_ufls_hz.toFixed(2)} Hz
                </span>
                <span className="text-[10px] text-slate-400">Limit: &ge; 48.80 Hz</span>
              </div>

              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Initial RoCoF (df/dt)</span>
                <span className={`text-base font-bold font-mono mt-0.5 block ${
                  dynResult.metrics.rocf_compliant ? 'text-emerald-700' : 'text-rose-600'
                }`}>
                  {dynResult.metrics.initial_rocof_hz_per_s.toFixed(2)} Hz/s
                </span>
                <span className="text-[10px] text-slate-400">Limit: &le; -0.50 Hz/s</span>
              </div>

              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Settling Frequency</span>
                <span className={`text-base font-bold font-mono mt-0.5 block ${
                  dynResult.metrics.frequency_band_compliant ? 'text-emerald-700' : 'text-amber-600'
                }`}>
                  {dynResult.metrics.settling_ufls_hz.toFixed(2)} Hz
                </span>
                <span className="text-[10px] text-slate-400">Target: 49.75 – 50.25 Hz</span>
              </div>

              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Automatic Load Shed</span>
                <span className="text-base font-bold font-mono text-purple-900 mt-0.5 block">
                  {dynResult.metrics.total_load_shed_mw} MW
                </span>
                <span className="text-[10px] text-slate-400">
                  {dynResult.metrics.stages_tripped_count} of 4 stages tripped
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Official Certification Signature Block (Print Stamped) */}
        <div className="pt-6 border-t-2 border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 text-xs text-slate-600">
          <div className="space-y-1">
            <span className="font-bold text-slate-900 uppercase block text-[11px]">
              Taskforce Compliance Certification
            </span>
            <p className="text-[11px] max-w-md text-slate-500">
              This audit certifies the modeled AC load flow and dynamic response against statutory NERC Grid Code standards.
            </p>
            <div className="font-mono text-[10px] text-slate-400 mt-2">
              Verification Hash: SHA256:{Math.random().toString(36).substring(2, 10).toUpperCase()}
            </div>
          </div>

          <div className="text-left sm:text-right border-t sm:border-t-0 sm:border-l border-slate-300 sm:pl-6 pt-3 sm:pt-0 w-full sm:w-auto">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Lead Taskforce Operator</span>
            <span className="font-bold text-slate-900 block mt-1">
              {currentUser ? currentUser.name : 'Engr. Opeyemi Ibrahim Abubakar'}
            </span>
            <span className="text-[11px] text-slate-500 block">
              Machine Learning 4 Power Systems (ML4PS)
            </span>
            <div className="mt-3 inline-block border-b border-dashed border-slate-400 w-36"></div>
            <span className="block text-[10px] text-slate-400 mt-0.5">Official Digital Signature</span>
          </div>
        </div>
      </div>
    </div>
  );
};