'use client';

import React, { useState } from 'react';
import { Building2, ShieldCheck, Cpu, Globe, Award, FileText } from 'lucide-react';

export const AboutTab: React.FC = () => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Hero Overview Card */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 shadow-xs">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Prominent Large ML4PS Insignia */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 shrink-0 rounded-3xl border-2 border-purple-200/80 dark:border-purple-900/60 bg-gradient-to-br from-purple-50 via-white to-slate-50 dark:from-slate-900 dark:via-purple-950/20 dark:to-slate-900 p-4 shadow-sm flex items-center justify-center">
            {!imgError ? (
              <img
                src="/ml4ps-logo.png"
                alt="ML4PS Laboratory Logo"
                onError={() => setImgError(true)}
                className="w-full h-full object-contain drop-shadow-xs"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-3xl sm:text-4xl font-black tracking-tighter text-[#500b50] dark:text-purple-300 font-mono">
                  ML4PS
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-1 font-bold">
                  Lab • FUT Minna
                </span>
              </div>
            )}
          </div>

          {/* Core Institutional Title and Details */}
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/60 text-[#500b50] dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>National Power System Research Group</span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Machine Learning 4 Power Systems (ML4PS) Laboratory
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-[#500b50] dark:text-purple-400 mt-1">
                Department of Electrical &amp; Electronics Engineering • Federal University of Technology, Minna
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
              An institutional research consortium establishing indigenous, high-dimensional steady-state AC load flow solvers, transient dynamic frequency defense architectures, and machine-learning operational surrogates tailored for the 330/132 kV Nigerian Electricity Supply Industry (NESI).
            </p>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#500b50]" />
                <span>SEET / EEE Department</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                <span>Minna, Niger State, Nigeria</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Structural Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 flex items-center justify-center text-[#500b50] dark:text-purple-300">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            Platform Ownership &amp; Governance
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Maintained directly by the Machine Learning 4 Power Systems (ML4PS) research group under the auspices of the National Power System &amp; Development Taskforce at FUT Minna.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 flex items-center justify-center text-[#500b50] dark:text-purple-300">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            Computational Mission
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Delivering an open-access, IEEE- and NERC-compliant computational suite enabling steady-state AC load flow, N-1 security contingency screening, PSS tuning, and locational marginal pricing without proprietary software lock-in.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 flex items-center justify-center text-[#500b50] dark:text-purple-300">
            <Award className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            Sponsorship &amp; Utility Liaison
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Funded under the National Research Fund (NRF) initiative in technical collaboration with the National Independent System Operator (NISO) and the Transmission Company of Nigeria (TCN).
          </p>
        </div>
      </div>
    </div>
  );
};