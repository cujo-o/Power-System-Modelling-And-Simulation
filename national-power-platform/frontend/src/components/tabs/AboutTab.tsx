'use client';
import React from 'react';

export const AboutTab: React.FC = () => (
  <div className="space-y-6 max-w-5xl mx-auto">
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs space-y-4">
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="h-12 w-12 rounded-lg bg-[#500b50] text-white flex items-center justify-center font-bold text-lg">
          ML4PS
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">Machine Learning 4 Power Systems (ML4PS) Laboratory</h2>
          <p className="text-xs text-slate-500">
            Department of Electrical & Electronics Engineering | Federal University of Technology, Minna
          </p>
        </div>
      </div>

      <div className="space-y-3 text-xs leading-relaxed text-slate-700">
        <p>
          <strong>Platform Ownership:</strong> The National Power System Modelling & Simulation Platform is developed and managed by the <strong>Machine Learning 4 Power Systems (ML4PS)</strong> research group under the auspices of the <strong>National Power System & Development Taskforce</strong>.
        </p>
        <p>
          <strong>Mission:</strong> To deliver an open-access, indigenous, IEEE- and NERC-compliant computational suite for the Nigerian Electricity Supply Industry (NESI). It empowers researchers and transmission operators to perform steady-state AC load flow, transient dynamic frequency studies, Power System Stabilizer (PSS) tuning, and locational marginal pricing without proprietary software lock-in.
        </p>
        <p>
          <strong>Sponsorship:</strong> Funded under the National Research Fund (NRF) initiative in technical collaboration with the National Independent System Operator (NISO) and the Transmission Company of Nigeria (TCN).
        </p>
      </div>
    </div>
  </div>
);