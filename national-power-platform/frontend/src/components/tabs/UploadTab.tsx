'use client';

import React from 'react';
import { GridModelMeta, UserAccount } from '@/types/grid';
import { UploadCloud, FileCode, Trash2, CheckCircle2, Lock, LogIn, Check } from 'lucide-react';

interface UploadTabProps {
  uploadNotice: string | null;
  uploadLoading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  models: GridModelMeta[];
  onDelete: (id: string) => void;
  currentUser: UserAccount | null;
  onLoginClick: () => void;
}

export const UploadTab: React.FC<UploadTabProps> = ({
  uploadNotice,
  uploadLoading,
  onFileUpload,
  models,
  onDelete,
  currentUser,
  onLoginClick,
}) => (
  <div className="space-y-6 max-w-7xl mx-auto">
    {/* Notification Banner */}
    {uploadNotice && (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 font-semibold shadow-xs">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <span>{uploadNotice}</span>
      </div>
    )}

    {/* Header */}
    <div className="pb-2 border-b border-slate-200">
      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
        Multi-Format Grid Model Ingestion
      </h2>
      <p className="text-sm text-slate-500 mt-0.5">
        Upload industry standard power flow and dynamic cases (.m, .raw, .xlsx, .json, .aux) for automated parsing.
      </p>
    </div>

    {/* Authentication Gate */}
    {!currentUser ? (
      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-10 text-center flex flex-col items-center justify-center">
        <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
          <Lock className="h-7 w-7 text-amber-700" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Operator Authentication Required</h3>
        <p className="text-sm text-slate-600 max-w-md mt-1.5 leading-relaxed">
          Case ingestion and cloud storage are restricted to authenticated operators in compliance with taskforce rules.
        </p>
        <button
          onClick={onLoginClick}
          className="mt-5 flex items-center gap-2 rounded-xl bg-[#500b50] text-white px-6 py-2.5 text-sm font-bold hover:bg-[#680f68] transition shadow-xs"
        >
          <LogIn className="h-4 w-4" />
          <span>Sign In to Upload Cases</span>
        </button>
      </div>
    ) : (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-2 border-dashed border-slate-300 hover:border-[#500b50] rounded-xl p-10 text-center transition flex flex-col items-center justify-center bg-slate-50/60">
          <UploadCloud className="h-12 w-12 text-[#500b50] mb-3" />
          <p className="text-base font-bold text-slate-900">
            Upload Simulation Network Models
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Logged in as <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.institution})
          </p>

          <input
            type="file"
            id="fileUploadInput"
            accept=".m,.json,.xlsx,.xls,.raw,.aux"
            className="hidden"
            onChange={onFileUpload}
          />
          <label
            htmlFor="fileUploadInput"
            className={`mt-5 cursor-pointer rounded-xl bg-[#500b50] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#680f68] shadow-xs ${
              uploadLoading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {uploadLoading ? 'Parsing Simulation File...' : 'Choose Case File'}
          </label>
        </div>
      </div>
    )}

    {/* Registered Models Table */}
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
      <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
        <span>Registered Simulation Models</span>
        <span className="font-mono text-emerald-300">{models.length} Models in Cloud Storage</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[700px]">
          <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
            <tr>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4">Model Name</th>
              <th className="py-3 px-4">Voltage Class</th>
              <th className="py-3 px-4">Platform</th>
              <th className="py-3 px-4">Buses</th>
              <th className="py-3 px-4">Branches</th>
              <th className="py-3 px-4">Installed Capacity</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {models.map((m) => (
              <tr key={m.id} className={`hover:bg-slate-50 ${m.is_active ? 'bg-emerald-50/50' : ''}`}>
                <td className="py-3 px-4">
                  {m.is_active ? (
                    <span className="inline-block h-3 w-3 rounded-full bg-emerald-600"></span>
                  ) : (
                    <span className="inline-block h-3 w-3 rounded-full bg-slate-300"></span>
                  )}
                </td>
                <td className="py-3 px-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2.5">
                    <FileCode className="h-4 w-4 text-[#500b50] shrink-0" />
                    <span>{m.name}</span>
                    {m.is_default && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                        Default
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 font-mono font-semibold text-slate-700">{m.voltage_level}</td>
                <td className="py-3 px-4 font-mono text-slate-500">{m.platform}</td>
                <td className="py-3 px-4 font-mono">{m.buses}</td>
                <td className="py-3 px-4 font-mono">{m.branches}</td>
                <td className="py-3 px-4 font-mono font-bold text-[#500b50]">
                  {m.total_installed_mw.toLocaleString()} MW
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2.5">
                    {m.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        <Check className="h-3 w-3" />
                        <span>Active Case</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">
                        Select in Grid Stability
                      </span>
                    )}

                    {!m.is_default && (
                      <button
                        onClick={() => onDelete(m.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Delete Model"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);