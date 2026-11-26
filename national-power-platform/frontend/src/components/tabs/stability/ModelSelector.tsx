'use client';

import React, { useState, useMemo } from 'react';
import { RefreshCw, UploadCloud, Check, ArrowRight } from 'lucide-react';
import { GridModelMeta } from '@/types/grid';

interface ModelSelectorProps {
  models: GridModelMeta[];
  activeModelName: string;
  modelsLoading: boolean;
  activatingId: string | null;
  isAdmin: boolean;
  onSelectModel: (id: string) => void;
  onRefreshModels?: () => Promise<void> | void;
  onGoToUpload: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  activeModelName,
  modelsLoading,
  activatingId,
  isAdmin,
  onSelectModel,
  onRefreshModels,
  onGoToUpload,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'Static' | 'Dynamic'>('ALL');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '330kV' | '132kV' | '130kV'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return models.filter((m) => {
      const domain = (m.domain || '').toLowerCase();
      const matchesDomain =
        domainFilter === 'ALL' ||
        (domainFilter === 'Static' && (domain.includes('static') || domain.includes('steady'))) ||
        (domainFilter === 'Dynamic' && domain.includes('dynamic'));

      const level = (m.voltage_level || '').toLowerCase();
      const matchesVoltage =
        voltageFilter === 'ALL' ||
        (voltageFilter === '330kV' && level.includes('330')) ||
        (voltageFilter === '132kV' && (level.includes('132') || level.includes('130'))) ||
        (voltageFilter === '130kV' && (level.includes('130') || level.includes('132')));

      const matchesPlatform =
        platformFilter === 'ALL' ||
        (m.platform || '').toLowerCase().includes(platformFilter.toLowerCase());

      const matchesSearch =
        !query ||
        (m.name || '').toLowerCase().includes(query) ||
        level.includes(query);

      return matchesDomain && matchesVoltage && matchesPlatform && matchesSearch;
    });
  }, [models, domainFilter, voltageFilter, platformFilter, searchQuery]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto py-1 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Grid Stability &amp; Dynamic Models
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select a transmission network case to launch the operational studio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
            {filteredModels.length} of {models.length} Models
          </span>
          {onRefreshModels && (
            <button
              onClick={() => onRefreshModels()}
              disabled={modelsLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:text-slate-900 font-semibold"
            >
              <RefreshCw className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Search Model</label>
            <input
              type="text"
              placeholder="Search case name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#500b50]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Domain</label>
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value as 'ALL' | 'Static' | 'Dynamic')}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
            >
              <option value="ALL">All Domains</option>
              <option value="Static">Static Power Flow</option>
              <option value="Dynamic">Dynamic &amp; Transient</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Voltage Class</label>
            <select
              value={voltageFilter}
              onChange={(e) =>
                setVoltageFilter(e.target.value as 'ALL' | '330kV' | '132kV' | '130kV')
              }
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
            >
              <option value="ALL">All Classes</option>
              <option value="330kV">330 kV Bulk Backbone</option>
              <option value="132kV">132 kV Sub-Transmission</option>
              <option value="130kV">130 kV Regional Feeder</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Format</label>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-semibold"
            >
              <option value="ALL">All Formats</option>
              <option value="MATPOWER">MATPOWER (.m)</option>
              <option value="pandapower">pandapower (.json)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Model Cards */}
      {filteredModels.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 bg-white space-y-2">
          <UploadCloud className="h-8 w-8 text-[#500b50] mx-auto" />
          <p className="text-sm font-bold text-slate-800">
            {modelsLoading ? 'Loading registered models...' : 'No Simulation Models Available'}
          </p>
          {isAdmin ? (
            <button
              onClick={onGoToUpload}
              className="mt-2 px-3 py-1.5 rounded-lg bg-[#500b50] text-white text-xs font-bold"
            >
              Go to Upload
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              Ask a platform administrator to upload a MATPOWER (.m) or pandapower (.json) case.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredModels.map((m) => {
            const isCurrent = m.is_active || m.name === activeModelName;
            const isDynamicModel =
              m.name.toLowerCase().includes('dynamic') ||
              (m.domain || '').toLowerCase().includes('dynamic');

            return (
              <div
                key={`${m.id}-${m.name}`}
                className={`p-4 rounded-xl border bg-white shadow-2xs flex flex-col justify-between transition ${
                  isCurrent
                    ? 'border-emerald-600 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-[#500b50] border border-purple-200">
                        {m.voltage_level}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {m.platform}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isDynamicModel
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-blue-50 text-blue-800'
                        }`}
                      >
                        {isDynamicModel ? 'Dynamic' : 'Static'}
                      </span>
                    </div>

                    {isCurrent && (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        <span>Active</span>
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{m.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {m.buses} Substations • {m.branches} Corridors •{' '}
                      {(m.total_installed_mw || 0).toLocaleString()} MW
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onSelectModel(m.id)}
                  disabled={activatingId !== null}
                  className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    isCurrent
                      ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                      : 'bg-[#500b50] text-white hover:bg-[#680f68]'
                  }`}
                >
                  {activatingId === m.id && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isCurrent ? 'Open' : 'Run'}</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
