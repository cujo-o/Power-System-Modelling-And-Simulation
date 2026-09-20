'use client';

import React, { useState } from 'react';
import { BusData, LineData } from '@/types/grid';
import { ZoomIn, ZoomOut, Maximize2, Zap, RotateCcw, MapPin, Layers } from 'lucide-react';

interface DiagramProps {
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  toggleLine: (id: number) => void;
  selectedBus: BusData | null;
  setSelectedBus: (bus: BusData | null) => void;
  onReset: () => void;
  modelName: string;
}

// 1. Nig 10-Bus Clean Orthogonal CAD Coordinates
const NIG10_SCHEMATIC: Record<number, { x: number; y: number }> = {
  0: { x: 120, y: 90 },   // Kainji GS
  1: { x: 270, y: 90 },   // Jebba TS/GS
  2: { x: 470, y: 90 },   // Shiroro GS
  3: { x: 650, y: 90 },   // Katampe (Abuja)
  4: { x: 270, y: 240 },  // Osogbo NCC Hub
  7: { x: 500, y: 240 },  // Benin 330kV TS
  5: { x: 120, y: 390 },  // Ikeja West
  6: { x: 270, y: 390 },  // Egbin PS (Slack)
  8: { x: 500, y: 390 },  // Afam VI GS
  9: { x: 650, y: 390 },  // Delta IV GS
};

// 2. Realistic Spatial Coordinates Across Nigeria (Mapped to 760 x 480 Canvas)
const NIGERIA_GEOGRAPHIC_COORDS: Record<number, { x: number; y: number }> = {
  // Lagos / South-West
  1: { x: 145, y: 375 },  // AJA
  2: { x: 110, y: 370 },  // AKANGBA
  3: { x: 135, y: 365 },  // EGBIN (Slack)
  4: { x: 100, y: 360 },  // IKEJA WEST
  5: { x: 65, y: 355 },   // SAKETE (Benin border)
  6: { x: 105, y: 330 },  // OLORUNSOGO
  7: { x: 115, y: 350 },  // OKE-ARO
  8: { x: 120, y: 375 },  // ALAGBON
  9: { x: 140, y: 380 },  // LEKKI
  10: { x: 105, y: 360 }, // IKEJA W 3B
  11: { x: 140, y: 310 }, // AYEDE (Ibadan)
  12: { x: 180, y: 290 }, // OSOGBO NCC
  13: { x: 175, y: 260 }, // GANMO (Ilorin)
  26: { x: 190, y: 345 }, // OMOTOSHO

  // North-West & North-Central
  14: { x: 110, y: 100 }, // BIRNIN KEBBI
  15: { x: 180, y: 220 }, // JEBBA TS
  16: { x: 175, y: 210 }, // JEBBA GS
  17: { x: 150, y: 190 }, // KAINJI GS
  18: { x: 220, y: 200 }, // TRIPLE POINT
  19: { x: 250, y: 195 }, // ZUNGERU TS
  20: { x: 260, y: 190 }, // ZUNGERU GS
  21: { x: 290, y: 190 }, // SHIRORO GS
  22: { x: 140, y: 205 }, // NBUSA FAKUN
  31: { x: 320, y: 170 }, // KADUNA
  32: { x: 340, y: 165 }, // MANDO
  59: { x: 390, y: 100 }, // KANO
  60: { x: 410, y: 90 },  // RIMIN ZAKARA

  // FCT & Central
  54: { x: 330, y: 235 }, // KATAMPE (Abuja)
  56: { x: 320, y: 255 }, // GWAGWALADA
  57: { x: 290, y: 295 }, // LOKOJA
  53: { x: 285, y: 310 }, // AJAOKUTA
  55: { x: 295, y: 315 }, // GEREGU
  58: { x: 400, y: 260 }, // LAFIA

  // North-East
  34: { x: 430, y: 195 }, // JOS
  36: { x: 440, y: 200 }, // JOS 1B
  37: { x: 480, y: 175 }, // BAUCHI
  33: { x: 550, y: 175 }, // GOMBE
  35: { x: 640, y: 230 }, // YOLA
  40: { x: 620, y: 245 }, // MAYO BELWA
  41: { x: 570, y: 255 }, // JALINGO
  39: { x: 600, y: 110 }, // DAMATURU
  38: { x: 670, y: 100 }, // MAIDUGURI

  // Mid-West & Delta
  23: { x: 240, y: 355 }, // BENIN
  27: { x: 250, y: 350 }, // AZURA
  30: { x: 255, y: 355 }, // IHOVBOR
  25: { x: 245, y: 385 }, // SAPELE
  29: { x: 250, y: 380 }, // SAPELE 3B
  28: { x: 240, y: 405 }, // ALADJA
  24: { x: 260, y: 405 }, // DELTA IV (Ughelli)
  46: { x: 295, y: 365 }, // ASABA
  44: { x: 295, y: 395 }, // OKPAI

  // South-East & South-South
  43: { x: 310, y: 370 }, // ONITSHA
  42: { x: 345, y: 355 }, // NEW HAVEN (Enugu)
  47: { x: 355, y: 360 }, // UGWUAJI
  45: { x: 410, y: 300 }, // MAKURDI
  61: { x: 320, y: 400 }, // OWERRI
  62: { x: 310, y: 410 }, // EGBEMA
  63: { x: 295, y: 420 }, // OMOKU
  49: { x: 345, y: 415 }, // ALAOJI (Aba)
  48: { x: 335, y: 430 }, // AFAM IV-VI
  51: { x: 370, y: 415 }, // IKOT EKPENE
  50: { x: 400, y: 415 }, // ADIAGBO
  52: { x: 420, y: 425 }, // CALABAR
};

export const SingleLineDiagram: React.FC<DiagramProps> = ({
  buses,
  lines,
  trippedLines,
  toggleLine,
  selectedBus,
  setSelectedBus,
  onReset,
  modelName,
}) => {
  const [viewMode, setViewMode] = useState<'schematic' | 'geographic'>('schematic');
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const isNig10 = modelName.includes('10-Bus');

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 4.0));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.4));
  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((z) => Math.min(Math.max(z + delta, 0.4), 4.0));
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

  const getCoordinates = (bus: BusData) => {
    if (viewMode === 'geographic') {
      if (NIGERIA_GEOGRAPHIC_COORDS[bus.id]) {
        return NIGERIA_GEOGRAPHIC_COORDS[bus.id];
      }
    } else {
      if (isNig10 && NIG10_SCHEMATIC[bus.id]) {
        return NIG10_SCHEMATIC[bus.id];
      }
    }
    // Fallback to backend bus geodata or geographic matrix
    if (NIGERIA_GEOGRAPHIC_COORDS[bus.id]) {
      return NIGERIA_GEOGRAPHIC_COORDS[bus.id];
    }
    return { x: bus.x || 250, y: bus.y || 250 };
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">
            Interactive Single-Line Diagram & Vector Map
          </h2>
          <p className="text-xs text-slate-500">
            {viewMode === 'schematic'
              ? 'IEEE standard busbar schematic with circuit breaker trip cubicles.'
              : 'True geographic spatial transmission layout across Nigeria.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Dual View Toggle */}
          <div className="flex rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs">
            <button
              onClick={() => setViewMode('schematic')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition ${
                viewMode === 'schematic'
                  ? 'bg-[#500b50] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Schematic CAD</span>
            </button>
            <button
              onClick={() => setViewMode('geographic')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition ${
                viewMode === 'geographic'
                  ? 'bg-[#500b50] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>Geographic Map</span>
            </button>
          </div>

          {/* Zoom and Pan Controls */}
          <div className="flex items-center rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs">
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-700"
              title="Zoom In (+)"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="px-2 font-mono text-[11px] font-bold text-slate-600">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-700"
              title="Zoom Out (-)"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-slate-100 rounded border-l ml-0.5 text-slate-700"
              title="Reset View"
            >
              <Maximize2 className="h-3.5 w-3.5" />
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
        {/* Vector CAD Viewport */}
        <div
          className="lg:col-span-2 rounded-lg border border-slate-800 bg-[#0c1427] p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-md cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg viewBox="0 0 760 480" className="w-full h-[410px] sm:h-[470px] select-none">
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
              {/* Transmission Corridors */}
              {lines.map((line) => {
                const fromBus = buses.find((b) => b.id === line.from_bus);
                const toBus = buses.find((b) => b.id === line.to_bus);
                if (!fromBus || !toBus) return null;

                const cFrom = getCoordinates(fromBus);
                const cTo = getCoordinates(toBus);
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
                      strokeWidth={isTripped ? 2 : 2.5}
                      strokeDasharray={isTripped ? '6 6' : 'none'}
                      className="transition-colors group-hover:stroke-white"
                    />

                    {/* Circuit Breaker Box */}
                    <g transform={`translate(${midX}, ${midY})`} className="transition-transform group-hover:scale-125">
                      <rect
                        x="-6"
                        y="-6"
                        width="12"
                        height="12"
                        rx="1.5"
                        fill={isTripped ? '#4c0519' : '#064e3b'}
                        stroke={isTripped ? '#f43f5e' : '#10b981'}
                        strokeWidth="1.5"
                      />
                    </g>

                    {!isTripped && (
                      <g transform={`translate(${midX}, ${midY - 14})`}>
                        <rect x="-24" y="-8" width="48" height="15" rx="3" fill="#0a0f1d" stroke="#334155" strokeWidth="1" />
                        <text x="0" y="3.5" fill="#f8fafc" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {line.flow_mw} MW
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Substations (Busbars in Schematic, Clean Nodes in Geographic) */}
              {buses.map((bus) => {
                const isSelected = selectedBus?.id === bus.id;
                const isUnder = bus.v_pu < 0.95;
                const isOver = bus.v_pu > 1.05;
                const nodeColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#10b981';
                const coords = getCoordinates(bus);

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
                    {viewMode === 'schematic' ? (
                      // CAD Solid Copper Busbar
                      <>
                        <rect
                          x="-30"
                          y="-4.5"
                          width="60"
                          height="9"
                          rx="2"
                          fill={isSelected ? '#38bdf8' : nodeColor}
                          stroke="#0a0f1d"
                          strokeWidth="1.5"
                          filter={isSelected ? 'url(#node-glow)' : undefined}
                          className="transition-all group-hover:brightness-125"
                        />
                        <text x="0" y="20" fill="#f8fafc" fontSize="8.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {bus.name.split(' ')[0]}
                        </text>
                        <text x="0" y="30" fill={nodeColor} fontSize="7.5" fontFamily="monospace" textAnchor="middle">
                          {bus.v_pu.toFixed(2)} pu
                        </text>
                      </>
                    ) : (
                      // Geographic Circular Substation Node
                      <>
                        <circle
                          r={isSelected ? 10 : 6.5}
                          fill={isSelected ? '#38bdf8' : nodeColor}
                          stroke="#0a0f1d"
                          strokeWidth="2"
                          filter={isSelected ? 'url(#node-glow)' : undefined}
                          className="transition-all group-hover:scale-125"
                        />
                        <text x="10" y="3.5" fill="#f8fafc" fontSize="8" fontFamily="monospace" fontWeight="bold">
                          {bus.name.split(' ')[0]}
                        </text>
                      </>
                    )}
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
                Click on any node in the diagram to inspect live substation telemetry.
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
            <span>Click breaker squares to trip (N-1)</span>
            <span className="text-[#500b50] font-bold">
              {viewMode === 'schematic' ? '● CAD Busbars' : '● Geographic Map'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};