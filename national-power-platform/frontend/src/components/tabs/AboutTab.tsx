'use client';

import React, { useState } from 'react';
import { Cpu, Layers, Zap, ShieldCheck } from 'lucide-react';

export const AboutTab: React.FC = () => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 text-slate-800">
      <div className="flex items-center gap-3.5 pb-4 border-b border-slate-200">
        {!imgError ? (
          <img
            src="/ml4ps-logo.png"
            alt="ML4PS Logo"
            className="h-12 w-12 object-contain rounded-xl bg-white p-1 border border-purple-200 shadow-xs shrink-0"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-12 w-12 rounded-xl border border-purple-200 bg-purple-50 flex items-center justify-center shrink-0 shadow-xs">
            <Zap className="h-6 w-6 text-[#500b50] fill-[#500b50]" />
          </div>
        )}

        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">About the Platform</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Machine Learning 4 Power Systems (ML4PS) • FUT Minna
          </p>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2">
        <h3 className="font-bold text-sm text-slate-900">
          National Power System Modelling &amp; Simulation Platform
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Developed by the ML4PS research group at the Federal University of Technology, Minna, this platform supports analysis of the Nigerian Electricity Supply Industry (NESI) 330 kV and 132 kV transmission networks. It combines steady-state AC power flow, contingency and cascading outage analysis, transient frequency and rotor-angle stability, wholesale market clearing, and interactive single-line diagram visualization.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <Cpu className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">AC Power Flow Engine</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Multi-stage pandapower AC solver supporting Newton-Raphson, Iwamoto optimal damping, fast-decoupled load flow, and DC fallback for stressed topologies.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <Layers className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">Stability &amp; Contingency Analysis</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            N-1 breaker switching, sequential thermal cascading with island detection, governor droop load sharing, COI frequency response with 4-stage UFLS, and multi-machine CCT estimation.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <Zap className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">Interactive Single-Line Diagram</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Force-directed topological layout with draggable substations, parallel corridor separation, inline breaker controls, and PNG/SVG/CSV export.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <ShieldCheck className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">Grid Code Compliance</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Automated auditing against Nigerian Grid Code operating limits (0.95–1.05 pu bus voltage envelope and continuous branch thermal limits).
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-1">
        <div>
          <span className="font-bold text-slate-800">Federal University of Technology, Minna</span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Department of Electrical &amp; Electronics Engineering
          </p>
        </div>
        <span className="font-mono text-[11px] text-slate-400">ML4PS • 2026</span>
      </div>
    </div>
  );
};
