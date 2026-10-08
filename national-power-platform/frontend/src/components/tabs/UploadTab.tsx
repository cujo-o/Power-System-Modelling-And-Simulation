'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

interface UploadResult {
  filename: string;
  buses: number;
  branches: number;
  generators: number;
  total_capacity_mw: number;
  voltage_class: string;
  format: string;
}

interface Props {
  apiBaseUrl?: string;
  onUploadSuccess?: () => void;
  onNavigateToStability?: () => void;
  userName?: string;
  userInstitution?: string;
}

export const UploadTab: React.FC<Props> = ({
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-platform.onrender.com',
  onUploadSuccess,
  onNavigateToStability,
  userName = 'Operator',
  userInstitution = 'FUT Minna',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileProcess = async (file: File) => {
    if (!file) return;

    setErrorMsg(null);
    setLastUploaded(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${apiBaseUrl}/api/models/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Model parsing failed.');
      }

      setLastUploaded({
        filename: file.name,
        buses: data.buses ?? data.bus_count ?? 0,
        branches: data.branches ?? data.branch_count ?? 0,
        generators: data.generators ?? data.gen_count ?? 0,
        total_capacity_mw: data.total_installed_mw ?? data.total_capacity_mw ?? 0,
        voltage_class: data.voltage_level ?? '330kV',
        format: data.platform ?? 'MATPOWER',
      });

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload and parse model file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Model Ingestion &amp; Network Parsing
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Upload 330kV, 132kV, or 130kV cases (.m, .raw, .130, .xlsx, .json) for AC power flow validation.
        </p>
      </div>

      {lastUploaded && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">
                Model Ingested: <span className="font-mono text-emerald-900">{lastUploaded.filename}</span>
              </h4>
              <p className="text-xs text-slate-600 font-mono">
                {lastUploaded.buses} Buses • {lastUploaded.branches} Lines • {lastUploaded.generators} Units • {lastUploaded.total_capacity_mw.toLocaleString()} MW ({lastUploaded.voltage_class})
              </p>
            </div>
          </div>

          {onNavigateToStability && (
            <button
              onClick={onNavigateToStability}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
            >
              <span>Manage in Grid Stability</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-xs flex items-center gap-3 text-xs text-rose-700">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileProcess(e.dataTransfer.files[0]);
          }
        }}
        className={`relative rounded-3xl border-2 border-dashed p-10 sm:p-14 text-center transition-all bg-white shadow-xs ${
          isDragging
            ? 'border-[#500b50] bg-purple-50/30 ring-4 ring-[#500b50]/10'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".m,.raw,.130,.xlsx,.json,.aux"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileProcess(e.target.files[0]);
            }
          }}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center text-[#500b50]">
            {uploading ? (
              <RefreshCw className="h-8 w-8 animate-spin" />
            ) : (
              <UploadCloud className="h-8 w-8" />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              {uploading ? 'Parsing Network Topology...' : 'Upload Simulation Network Models'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-mono">
              Drag and drop model files here or select from disk.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 rounded-xl bg-[#500b50] hover:bg-[#680f68] text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              Choose Case File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};