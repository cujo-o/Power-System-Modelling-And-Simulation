'use client';
import React, { useState } from 'react';
import { BusData, LineData } from '@/types/grid';
import { ZoomIn, ZoomOut, Maximize2, Zap, RotateCcw } from 'lucide-react';

interface DiagramProps {
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  toggleLine: (id: number) => void;
  selectedBus: BusData | null;
  setSelectedBus: (bus: BusData | null) => void;
  onReset: () => void;
}

const NIG10_SCHEMATIC: Record<number, { x: number; y: number; name: string }> = {
  0: { x: 120, y: 90, name: 'Kainji GS' },
  1: { x: 270, y: 90, name: 'Jebba TS/GS' },
  2: { x: 470, y: 90, name: 'Shiroro GS' },
  3: { x: 650, y: 90, name: 'Katampe (Abuja)' },
  4: { x: 270, y: 240, name: 'Osogbo NCC Hub' },
  7: { x: 500, y: 240, name: 'Benin 330kV TS' },
  5: { x: 120, y: 390, name: 'Ikeja West' },
  6: { x: 270, y: 390, name: 'Egbin PS (Slack)' },
  8: { x: 500, y: 390, name: 'Afam VI GS' },
  9: { x: 650, y: 390, name: 'Delta IV GS' },
};

export const SingleLineDiagram: React.FC<DiagramProps> = ({
  buses,
  lines,
  trippedLines,
  toggleLine,
  selectedBus,
  setSelectedBus,
  onReset,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 3.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((z) => Math.min(Math.max(z + delta, 0.5), 3.5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const getCoords = (bus: BusData) => {
    if (NIG10_SCHEMATIC[bus.id]) return NIG10_SCHEMATIC[bus.id];
    return { x: bus.x || 250, y: bus.y || 250 };
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">Interactive CAD Single-Line Diagram</h2>
          <p className="text-xs text-slate-500">
            Scroll to zoom in/out, click & drag to pan, and click breaker cubicles to trigger N-1 contingency.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs">
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-slate-100 rounded" title="Zoom In (+)">
              <ZoomIn className="h-4 w-4 text-slate-700" />
            </button>
            <span className="px-2 font-mono text-[11px] font-bold text-slate-600">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-slate-100 rounded" title="Zoom Out (-)">
              <ZoomOut className="h-4 w-4 text-slate-700" />
            </button>
            <button onClick={handleResetZoom} className="p-1.5 hover:bg-slate-100 rounded border-l ml-0.5" title="Reset View">
              <Maximize2 className="h-3.5 w-3.5 text-slate-700" />
            </button>
          </div>

          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Vector Canvas */}
        <div
          className="lg:col-span-2 rounded-lg border border-slate-800 bg-[#0c1427] p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-md cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg viewBox="0 0 760 480" className="w-full h-[400px] sm:h-[460px] select-none">
            <defs>
              <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
              {/* Lines & Corridors */}
              {lines.map((line) => {
                const fromBus = buses.find((b) => b.id === line.from_bus);
                const toBus = buses.find((b) => b.id === line.to_bus);
                if (!fromBus || !toBus) return null;

                const cFrom = getCoords(fromBus);
                const cTo = getCoords(toBus);
                const isTripped = trippedLines.includes(line.id);
                const midX = (cFrom.x + cTo.x) / 2;
                const midY = (cFrom.y + cTo.y) / 2;

                const strokeColor = isTripped
                  ? '#f43f5e'
                  : line.loading_percent > 85
                  ? '#fbbf24'
                  : '#10b981';

                return (
                  <g key={line.id} className="cursor-pointer group" onClick={() => toggleLine(line.id)}>
                    <line
                      x1={cFrom.x}
                      y1={cFrom.y}
                      x2={cTo.x}
                      y2={cTo.y}
                      stroke={strokeColor}
                      strokeWidth={2.5}
                      strokeDasharray={isTripped ? '6 6' : 'none'}
                      className="transition-colors group-hover:stroke-white"
                    />

                    {/* Circuit Breaker Box */}
                    <g transform={`translate(${midX}, ${midY})`} className="transition-transform group-hover:scale-125">
                      <rect
                        x="-6.5"
                        y="-6.5"
                        width="13"
                        height="13"
                        rx="2"
                        fill={isTripped ? '#4c0519' : '#064e3b'}
                        stroke={isTripped ? '#f43f5e' : '#10b981'}
                        strokeWidth="1.5"
                      />
                    </g>

                    {!isTripped && (
                      <g transform={`translate(${midX}, ${midY - 14})`}>
                        <rect x="-24" y="-8" width="48" height="15" rx="3" fill="#0a0f1d" stroke="#334155" strokeWidth="1" />
                        <text x="0" y="3.5" fill="#f8fafc" fontSize="8.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {line.flow_mw} MW
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Substations */}
              {buses.map((bus) => {
                const isSelected = selectedBus?.id === bus.id;
                const isUnder = bus.v_pu < 0.95;
                const isOver = bus.v_pu > 1.05;
                const nodeColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#10b981';
                const coords = getCoords(bus);

                return (
                  <g
                    key={bus.id}
                    transform={`translate(${coords.x}, ${coords.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBus(bus);
                    }}
                    className="cursor-pointer group"
                  >
                    <rect
                      x="-32"
                      y="-4.5"
                      width="64"
                      height="9"
                      rx="2"
                      fill={isSelected ? '#38bdf8' : nodeColor}
                      stroke="#0a0f1d"
                      strokeWidth="1.5"
                      filter={isSelected ? 'url(#node-glow)' : undefined}
                      className="transition-all group-hover:brightness-125"
                    />
                    <text x="0" y="22" fill="#f8fafc" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                      {bus.name.split(' ')[0]}
                    </text>
                    <text x="0" y="32" fill={nodeColor} fontSize="8" fontFamily="monospace" textAnchor="middle">
                      {bus.v_pu.toFixed(2)} pu
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Substation Inspector Side Panel */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-[#500b50] mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" /> Substation Inspector
            </h3>
            {selectedBus ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Substation</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedBus.name}</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">{selectedBus.zone} Regional Zone</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Voltage (|V|)</span>
                    <span className={`font-bold ${selectedBus.v_pu < 0.95 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {selectedBus.v_pu} pu
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Angle (°)</span>
                    <span className="font-bold text-slate-800">{selectedBus.va_deg}°</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Active</span>
                    <span className="font-bold text-[#500b50]">{selectedBus.p_mw} MW</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Reactive</span>
                    <span className="font-bold text-amber-700">{selectedBus.q_mvar} MVAR</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded p-4">
                Click on any busbar in the Single-Line Diagram to inspect live telemetry.
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
            <span>Click breaker boxes to trip (N-1)</span>
            <span className="text-[#500b50] font-bold">● Active Telemetry</span>
          </div>
        </div>
      </div>
    </div>
  );
};