'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, useGrid } from '@/context/GridContext';
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

/**
 * Sanitizes a MATPOWER .m file so inline string names inside `mpc.bus = [...]`
 * are extracted into `mpc.bus_name = {...};` and `mpc.bus` stays strictly numeric.
 * This prevents the Python backend parser from failing on inline bus names.
 */
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

  // 1. Clean mpc.bus block
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

      // Extract any quoted bus name in the row, e.g. 'Kainji Hydro GS'
      const quoteMatch = trimmed.match(/['"]([^'"]+)['"]/);
      let rowWithoutComment = trimmed.split('%')[0];

      if (quoteMatch) {
        extractedNames.push(quoteMatch[1].trim());
        rowWithoutComment = rowWithoutComment.replace(/['"][^'"]+['"]/g, '');
      } else {
        const commentPart = trimmed.includes('%') ? trimmed.split('%')[1].trim() : '';
        if (commentPart) extractedNames.push(commentPart);
      }

      // Keep only valid numeric tokens
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
        // Pad up to 13 standard MATPOWER bus columns if needed
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

    // Append mpc.bus_name cell array if names were extracted and mpc.bus_name is not already present
    if (extractedNames.length > 0 && !/mpc\.bus_name\s*=/.test(cleanedText)) {
      const cellRows = extractedNames.map((n) => `\t'${n.replace(/'/g, '')}';`).join('\n');
      cleanedText += `\n\nmpc.bus_name = {\n${cellRows}\n};\n`;
    }
  }

  // 2. Count generators & installed capacity
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

  // 3. Count branches
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

export const UploadTab: React.FC = () => {
  const router = useRouter();
  const { models, fetchModels, activateModel } = useGrid();

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
        busesCount: 0,
        branchesCount: 0,
        installedMw: 0,
        demandMw: 0,
        baseKv: 330,
      };

      if (isMatpower) {
        const sanitized = sanitizeMatpowerContent(rawText);
        parsedMeta = sanitized;
        const blob = new Blob([sanitized.cleanedText], { type: 'text/plain;charset=utf-8' });
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

      // Save model metadata + network_payload to Supabase `grid_models` so it persists permanently
      if (supabase) {
        try {
          const rowToSave: Record<string, any> = {
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
          };

          if (backendData?.network_payload) {
            rowToSave.network_payload = backendData.network_payload;
          }

          await supabase.from('grid_models').upsert([rowToSave], { onConflict: 'id' });
        } catch {}
      }

      await fetchModels();
      await activateModel(modelId);

      setSuccessMsg(
        `Successfully parsed and activated "${selectedFile.name}" (${
          backendData?.buses || parsedMeta.busesCount
        } Substations, ${backendData?.branches || parsedMeta.branchesCount} Corridors).`
      );
      setSelectedFile(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to parse simulation network.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteModel = async (id: string, name: string) => {
    if (supabase) {
      try {
        await supabase.from('grid_models').delete().eq('id', id);
        await supabase.from('grid_models').delete().eq('name', name);
      } catch {}
    }
    try {
      await fetch(`${API_BASE}/api/models/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {}
    await fetchModels();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 text-slate-800">
      <div>
        
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

      {/* Drag and Drop Upload Box */}
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
                key={m.id}
                className="p-3.5 flex items-center justify-between hover:bg-slate-50"
              >
                <div>
                  <span className="font-bold text-slate-900">{m.name}</span>
                  <span className="ml-2 font-mono text-[11px] text-slate-500">
                    {m.voltage_level} • {m.buses} Substations • {m.branches} Corridors
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await activateModel(m.id);
                      router.push('/stability');
                    }}
                    className="px-3 py-1 rounded bg-[#500b50] text-white font-bold text-[11px]"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => handleDeleteModel(m.id, m.name)}
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