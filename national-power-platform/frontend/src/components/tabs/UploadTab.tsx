'use client';
import React from 'react';
import { GridModelMeta, UserAccount } from '@/types/grid';
import { UploadCloud, FileCode, Trash2, CheckCircle2, Lock, LogIn } from 'lucide-react';

interface UploadTabProps {
  uploadNotice: string | null;
  uploadLoading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  models: GridModelMeta[];
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  currentUser: UserAccount | null;
  onLoginClick: () => void;
}

export const UploadTab: React.FC<UploadTabProps> = ({
  uploadNotice,
  uploadLoading,
  onFileUpload,
  models,
  onActivate,
  onDelete,
  currentUser,
  onLoginClick,
}) => (
  <div className="space-y-6 max-w-5xl mx-auto">
    {uploadNotice && (
      <div className="flex items-center gap-2 rounded border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 font-semibold">
        <CheckCircle2 className="h-4 w-4 text-[#500b50]" />
        <span>{uploadNotice}</span>
      </div>
    )}

    <div>
      <h2 className="text-lg font-bold text-[#500b50]">Multi-Format Grid Model Ingestion</h2>
      <p className="text-xs text-slate-500">
        Supports MATPOWER (.m), PSAT, DIgSILENT PowerFactory (.raw/.xml), ETAP (.xlsx), and PowerWorld (.aux).
      </p>
    </div>

    {/* AUTHENTICATION GATE: Locked if not logged in */}
    {!currentUser ? (
      <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-8 text-center flex flex-col items-center justify-center">
        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
          <Lock className="h-6 w-6 text-amber-700" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">Operator Authentication Required</h3>
        <p className="text-xs text-slate-600 max-w-md mt-1 leading-relaxed">
          In compliance with National Power System & Development Taskforce security rules, case ingestion is restricted to authenticated and approved researchers.
        </p>
        <button
          onClick={onLoginClick}
          className="mt-4 flex items-center gap-1.5 rounded bg-[#500b50] text-white px-5 py-2 text-xs font-bold hover:bg-[#680f68] transition shadow-xs"
        >
          <LogIn className="h-3.5 w-3.5" />
          <span>Login / Register for Access</span>
        </button>
      </div>
    ) : (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-2 border-dashed border-slate-300 hover:border-[#500b50] rounded-lg p-8 text-center transition flex flex-col items-center justify-center bg-slate-50">
          <UploadCloud className="h-10 w-10 text-[#500b50] mb-2.5" />
          <p className="text-xs sm:text-sm font-bold text-slate-800">
            Upload Simulation Network Models
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
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
            className={`mt-4 cursor-pointer rounded bg-[#500b50] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6a106a] shadow-xs ${
              uploadLoading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {uploadLoading ? 'Parsing Simulation File...' : 'Choose Case File'}
          </label>
        </div>
      </div>
    )}

    {/* Models Table */}
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
      <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
        <span>Registered Simulation Models</span>
        <span className="font-mono text-emerald-300">{models.length} Models Available</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[650px]">
          <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold">
            <tr>
              <th className="p-2.5">Active</th>
              <th className="p-2.5">Model Name</th>
              <th className="p-2.5">Voltage</th>
              <th className="p-2.5">Platform Format</th>
              <th className="p-2.5">Buses</th>
              <th className="p-2.5">Branches</th>
              <th className="p-2.5">Capacity</th>
              <th className="p-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {models.map((m) => (
              <tr key={m.id} className={`hover:bg-[#fcfaff] ${m.is_active ? 'bg-emerald-50/50' : ''}`}>
                <td className="p-2.5">
                  {m.is_active ? (
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
                  ) : (
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300"></span>
                  )}
                </td>
                <td className="p-2.5 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-[#500b50] shrink-0" />
                    <span>{m.name}</span>
                    {m.is_default && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                        Default
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-2.5 font-mono text-slate-600">{m.voltage_level}</td>
                <td className="p-2.5 font-mono text-slate-500">{m.platform}</td>
                <td className="p-2.5 font-mono">{m.buses}</td>
                <td className="p-2.5 font-mono">{m.branches}</td>
                <td className="p-2.5 font-mono font-bold text-[#500b50]">{m.total_installed_mw} MW</td>
                <td className="p-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {!m.is_active ? (
                      <button
                        onClick={() => onActivate(m.id)}
                        className="rounded bg-[#500b50] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#6a106a] transition"
                      >
                        Activate
                      </button>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Active
                      </span>
                    )}
                    {!m.is_default && (
                      <button onClick={() => onDelete(m.id)} className="p-1 rounded text-slate-400 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
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