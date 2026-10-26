'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, useGrid } from '@/context/GridContext';
import { GridModelMeta } from '@/types/grid';
import {
  UploadCloud,
  FileCheck2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Trash2,
} from 'lucide-react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

function sanitizeMatpowerContent(rawText: string): {
  cleanedText: string;
  extractedNames: string[];
  busesCount: number;
  branchesCount: number;
  installedMw: number;
  demandMw: number;
  baseKv: number;
} {
  const extractedNames: string[] = [];
  let busesCount = 0;
  let branchesCount = 0;
  let installedMw = 0;
  let demandMw = 0;
  let baseKv = 330;

  const busMatch = rawText.match(/mpc\.bus\s*=\s*\[([\s\S]*?)\];/);
  let cleanedText = rawText;

  if (busMatch) {
    const rawBusBlock = busMatch[1];
    const cleanedRows: string[] = [];

    rawBusBlock.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%')) {
        cleanedRows.push(line);
        return;
      }

      const quoteMatch = trimmed.match(/['"]([^'"]+)['"]/);
      let rowWithoutComment = trimmed.split('%')[0];

      if (quoteMatch) {
        extractedNames.push(quoteMatch[1].trim());
        rowWithoutComment = rowWithoutComment.replace(/['"][^'"]+['"]/g, '');
      } else {
        const commentPart = trimmed.includes('%') ? trimmed.split('%')[1].trim() : '';
        if (commentPart) extractedNames.push(commentPart);
      }

      const nums = rowWithoutComment
        .replace(/;/g, '')
        .trim()
        .split(/\s+/)
        .filter((tok) => tok.length > 0 && !Number.isNaN(Number(tok)));

      if (nums.length >= 10) {
        busesCount++;
        const pd = Number(nums[2]) || 0;
        const kv = Number(nums[9]) || 330;
        demandMw += Math.max(0, pd);
        if (kv === 132 || kv === 130 || kv === 330) baseKv = kv;
        while (nums.length < 13) {
          if (nums.length === 10) nums.push('1');
          else if (nums.length === 11) nums.push('1.05');
          else if (nums.length === 12) nums.push('0.95');
        }
        cleanedRows.push(`\t${nums.slice(0, 13).join('\t')};`);
      }
    });

    cleanedText = cleanedText.replace(
      /mpc\.bus\s*=\s*\[[\s\S]*?\];/,
      `mpc.bus = [\n${cleanedRows.join('\n')}\n];`
    );

    if (extractedNames.length > 0 && !/mpc\.bus_name\s*=/.test(cleanedText)) {
      const cellRows = extractedNames.map((n) => `\t'${n.replace(/'/g, '')}';`).join('\n');
      cleanedText += `\n\nmpc.bus_name = {\n${cellRows}\n};\n`;
    }
  }

  const genMatch = cleanedText.match(/mpc\.gen\s*=\s*\[([\s\S]*?)\];/);
  if (genMatch) {
    genMatch[1].split('\n').forEach((line) => {
      const trimmed = line.split('%')[0].replace(/;/g, '').trim();
      if (!trimmed) return;
      const nums = trimmed.split(/\s+/).map(Number);
      if (nums.length >= 2 && !Number.isNaN(nums[0])) {
        const pmax = nums.length >= 9 && nums[8] > 0 ? nums[8] : Math.abs(nums[1]) * 1.25;
        installedMw += pmax;
      }
    });
  }

  const branchMatch = cleanedText.match(/mpc\.branch\s*=\s*\[([\s\S]*?)\];/);
  if (branchMatch) {
    branchMatch[1].split('\n').forEach((line) => {
      const trimmed = line.split('%')[0].replace(/;/g, '').trim();
      if (!trimmed) return;
      const nums = trimmed.split(/\s+/).map(Number);
      if (nums.length >= 4 && !Number.isNaN(nums[0])) {
        branchesCount++;
      }
    });
  }

  return {
    cleanedText,
    extractedNames,
    busesCount,
    branchesCount,
    installedMw: Math.round(installedMw),
    demandMw: Math.round(demandMw),
    baseKv,
  };
}

/**
 * Inserts or updates the uploaded model in Supabase `grid_models` by matching
 * the exact column names present in the table (avoids UUID or unknown-column errors).
 */
async function syncModelToSupabase(meta: GridModelMeta, networkPayload?: string) {
  if (!supabase) return;
  try {
    const { data: sampleRows } = await supabase.from('grid_models').select('*').limit(1);
    const sample = sampleRows && sampleRows[0] ? sampleRows[0] : null;
    const cols = sample ? new Set(Object.keys(sample)) : null;

    const candidate: Record<string, any> = {
      name: meta.name,
      voltage_level: meta.voltage_level,
      platform: meta.platform,
      format: meta.platform,
      domain: meta.domain,
      buses: meta.buses,
      bus_count: meta.buses,
      branches: meta.branches,
      branch_count: meta.branches,
      total_installed_mw: meta.total_installed_mw,
      total_capacity_mw: meta.total_installed_mw,
      total_demand_mw: meta.total_demand_mw,
      demand_mw: meta.total_demand_mw,
      is_active: true,
      converged: true,
      network_payload: networkPayload,
    };

    const payloadToWrite: Record<string, any> = {};
    if (cols) {
      Object.entries(candidate).forEach(([k, v]) => {
        if (cols.has(k) && v !== undefined) {
          payloadToWrite[k] = v;
        }
      });
      // Only include string `id` if the existing table uses non-UUID string IDs
      const sampleId = String(sample?.id || '');
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sampleId);
      if (!isUuid && typeof sample?.id === 'string') {
        payloadToWrite.id = meta.id;
      }
    } else {
      Object.assign(payloadToWrite, {
        name: meta.name,
        voltage_level: meta.voltage_level,
        buses: meta.buses,
        branches: meta.branches,
        total_installed_mw: meta.total_installed_mw,
        total_demand_mw: meta.total_demand_mw,
        is_active: true,
      });
    }

    const { data: existing } = await supabase
      .from('grid_models')
      .select('id')
      .eq('name', meta.name)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from('grid_models').update(payloadToWrite).eq('id', existing.id);
    } else {
      await supabase.from('grid_models').insert([payloadToWrite]);
    }
  } catch {}
}

export const UploadTab: React.FC = () => {
  const router = useRouter();
  const { models, activateModel, registerUploadedModel, removeRegisteredModel } = useGrid();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelection = (file: File | null) => {
    setError(null);
    setSuccessMsg(null);
    if (!file) return;
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const rawText = await selectedFile.text();
      const isMatpower = selectedFile.name.toLowerCase().endsWith('.m');

      let fileToUpload: File = selectedFile;
      let parsedMeta = {
        cleanedText: rawText,
        busesCount: 0,
        branchesCount: 0,
        installedMw: 0,
        demandMw: 0,
        baseKv: 330,
      };

      if (isMatpower) {
        parsedMeta = sanitizeMatpowerContent(rawText);
        const blob = new Blob([parsedMeta.cleanedText], { type: 'text/plain;charset=utf-8' });
        fileToUpload = new File([blob], selectedFile.name, { type: 'text/plain' });
      }

      const formData = new FormData();
      formData.append('file', fileToUpload, selectedFile.name);

      const res = await fetch(`${API_BASE}/api/models/upload`, {
        method: 'POST',
        body: formData,
      });

      let backendData: any = null;
      if (res.ok) {
        backendData = await res.json();
      } else {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody?.detail || errBody?.message || `HTTP ${res.status}`;
        throw new Error(detail);
      }

      const modelId = String(backendData?.id || selectedFile.name);
      const vLevel =
        backendData?.voltage_level ||
        (selectedFile.name.includes('132')
          ? '132kV'
          : selectedFile.name.includes('130')
          ? '130kV'
          : `${parsedMeta.baseKv}kV`);

      const isDynamic =
        selectedFile.name.toLowerCase().includes('dynamic') ||
        rawText.toLowerCase().includes('hydro') ||
        rawText.toLowerCase().includes('dynamic');

      const newModelMeta: GridModelMeta = {
        id: modelId,
        name: selectedFile.name,
        voltage_level: vLevel,
        platform: 'MATPOWER',
        domain: isDynamic ? 'Dynamic & Transient' : 'Static Power Flow',
        buses: Number(backendData?.buses || parsedMeta.busesCount || 0),
        branches: Number(backendData?.branches || parsedMeta.branchesCount || 0),
        total_installed_mw: Number(
          backendData?.total_installed_mw || parsedMeta.installedMw || 0
        ),
        total_demand_mw: Number(
          backendData?.total_demand_mw || parsedMeta.demandMw || 0
        ),
        is_active: true,
        converged: true,
      };

      // 1. Sync to Supabase schema-safely
      await syncModelToSupabase(newModelMeta, backendData?.network_payload);

      // 2. Register immediately in GridContext & localStorage so it shows up in all model lists
      await registerUploadedModel(newModelMeta, {
        network_payload: backendData?.network_payload,
        raw_file_text: parsedMeta.cleanedText,
      });

      setSuccessMsg(
        `Uploaded and activated "${selectedFile.name}" (${newModelMeta.buses} Substations, ${newModelMeta.branches} Corridors).`
      );
      setSelectedFile(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to parse simulation network.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 text-slate-800">
      <div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Model Ingestion &amp; Network Parsing
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Upload 330kV, 132kV, or 130kV cases (.m, .raw, .130, .xlsx, .json) for AC power flow and dynamic validation.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button
            onClick={() => router.push('/stability')}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 shrink-0"
          >
            <span>Open in Operational Deck</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelection(e.dataTransfer.files[0]);
          }
        }}
        className="p-10 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-center space-y-3 hover:border-[#500b50] transition"
      >
        <div className="h-12 w-12 rounded-2xl bg-purple-50 text-[#500b50] flex items-center justify-center mx-auto">
          <UploadCloud className="h-6 w-6" />
        </div>

        <div>
          <h3 className="font-bold text-sm text-slate-900">Upload Simulation Network Models</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Drag and drop model files here or select from disk.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".m,.raw,.130,.json,.csv,.xlsx"
          onChange={(e) => handleFileSelection(e.target.files?.[0] || null)}
          className="hidden"
        />

        <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-[#500b50] hover:bg-[#680f68] text-white text-xs font-bold transition"
          >
            Choose Case File
          </button>

          {selectedFile && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {uploading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileCheck2 className="h-3.5 w-3.5" />
              )}
              <span>
                {uploading ? 'Parsing & Validating...' : `Ingest "${selectedFile.name}"`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Registered Models List */}
      {models.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
            Registered Network Models ({models.length})
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {models.map((m) => (
              <div
                key={m.id + m.name}
                className="p-3.5 flex items-center justify-between hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{m.name}</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {m.voltage_level} • {m.buses} Substations • {m.branches} Corridors
                  </span>
                  {m.is_active && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await activateModel(m.name);
                      router.push('/stability');
                    }}
                    className="px-3 py-1 rounded bg-[#500b50] text-white font-bold text-[11px]"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => removeRegisteredModel(m.name)}
                    className="p-1.5 rounded border border-slate-200 text-rose-600 hover:bg-rose-50"
                    title="Delete Model"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};