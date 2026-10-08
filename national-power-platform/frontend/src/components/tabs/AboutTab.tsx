'use client';

import React, { useState } from 'react';
import { Cpu, Layers, Zap, ShieldCheck } from 'lucide-react';

export const AboutTab: React.FC = () => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 text-slate-800">
      {/* Header with Integrated ML4PS Logo */}
      <div className="flex items-center gap-3.5 pb-4 border-b border-slate-200">
        {!imgError ? (
          <img
            src="/ml4ps-logo.png"
            alt="ML4PS Crest"
            className="h-12 w-12 object-contain rounded-xl bg-white p-1 border border-purple-200 shadow-xs shrink-0"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-12 w-12 rounded-xl border border-purple-200 bg-purple-50 flex items-center justify-center shrink-0 shadow-xs">
            <Zap className="h-6 w-6 text-[#500b50] fill-[#500b50]" />
          </div>
        )}

        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            About the Platform
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Machine Learning 4 Power Systems (ML4PS) • FUT Minna
          </p>
        </div>
      </div>

      {/* Platform Overview */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2">
        <h3 className="font-bold text-sm text-slate-900">
          National Power System Simulation &amp; Research Platform
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          ML4PS is an engineering platform designed for analyzing bulk electrical transmission networks, with focused modeling of the Nigerian Electricity Supply Industry (NESI) 330kV and 132kV grids. The platform provides tools for steady-state power flow, dynamic frequency response, contingency screening, and single-line diagram visualization.
        </p>
      </div>

      {/* Core Capabilities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <Cpu className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">AC Power Flow Engine</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Full steady-state AC load flow analysis supporting Newton-Raphson, Iwamoto optimal multiplier, and fast-decoupled solvers.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <Layers className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">Grid Stability &amp; Contingency</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            N-1 contingency switching, cascading failure sequences, governor droop load sharing, and under-frequency load shedding (UFLS).
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <Zap className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">Interactive Single-Line CAD</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Topologically uncrossed single-line diagrams with physical collision avoidance, movable substations, and inline breaker controls.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#500b50]">
            <ShieldCheck className="h-4 w-4" />
            <h4 className="font-bold text-xs text-slate-900">Standards &amp; Compliance</h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Automated verification against Nigerian Grid Code statutory operating limits (0.95–1.05 pu voltage envelope and thermal line ratings).
          </p>
        </div>
      </div>

      {/* Institutional Credit */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-1">
        <div>
          <span className="font-bold text-slate-800">Federal University of Technology, Minna</span>
          <p className="text-[11px] text-slate-500 mt-0.5">Department of Electrical &amp; Electronics Engineering</p>
        </div>
        <span className="font-mono text-[11px] text-slate-400">ML4PS • 2026</span>
      </div>
    </div>
  );
};