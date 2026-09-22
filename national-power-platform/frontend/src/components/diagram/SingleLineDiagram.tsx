'use client';

import React, { useState, useRef, useMemo } from 'react';
import { BusData, LineData } from '@/types/grid';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Zap,
  RotateCcw,
  MapPin,
  Layers,
  Printer,
  Sparkles,
} from 'lucide-react';

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

interface Point {
  x: number;
  y: number;
}

// Regional Coordinates for Geographic Map Mode
const REGIONAL_GEOGRAPHIC_MAP: Record<number, Point> = {
  // Lagos & South-West
  1: { x: 250, y: 550 }, 2: { x: 190, y: 540 }, 3: { x: 230, y: 510 },
  4: { x: 160, y: 500 }, 5: { x: 80, y: 500 }, 6: { x: 150, y: 430 },
  7: { x: 180, y: 470 }, 8: { x: 210, y: 550 }, 9: { x: 280, y: 570 },
  10: { x: 170, y: 510 }, 11: { x: 190, y: 390 }, 12: { x: 260, y: 350 },
  13: { x: 260, y: 290 }, 26: { x: 280, y: 440 },

  // North-West & Hydro Generation
  14: { x: 130, y: 100 }, 15: { x: 270, y: 230 }, 16: { x: 240, y: 210 },
  17: { x: 190, y: 170 }, 18: { x: 340, y: 210 }, 19: { x: 370, y: 180 },
  20: { x: 350, y: 150 }, 21: { x: 440, y: 190 }, 22: { x: 160, y: 140 },
  31: { x: 500, y: 150 }, 32: { x: 540, y: 140 }, 59: { x: 580, y: 70 },
  60: { x: 620, y: 50 },

  // FCT & Central
  54: { x: 500, y: 250 }, 56: { x: 470, y: 280 }, 57: { x: 420, y: 310 },
  53: { x: 430, y: 350 }, 55: { x: 450, y: 370 }, 58: { x: 620, y: 280 },

  // North-East
  34: { x: 660, y: 200 }, 36: { x: 680, y: 180 }, 37: { x: 760, y: 150 },
  33: { x: 860, y: 160 }, 35: { x: 980, y: 260 }, 38: { x: 1000, y: 80 },
  39: { x: 920, y: 90 }, 40: { x: 950, y: 290 }, 41: { x: 880, y: 310 },

  // Mid-West & Delta
  23: { x: 380, y: 430 }, 24: { x: 400, y: 550 }, 25: { x: 360, y: 490 },
  27: { x: 410, y: 400 }, 28: { x: 360, y: 540 }, 29: { x: 370, y: 470 },
  30: { x: 410, y: 430 }, 44: { x: 460, y: 470 }, 46: { x: 450, y: 420 },

  // South-East & Niger Delta
  42: { x: 560, y: 410 }, 43: { x: 480, y: 430 }, 45: { x: 660, y: 330 },
  47: { x: 580, y: 430 }, 48: { x: 530, y: 570 }, 49: { x: 540, y: 500 },
  50: { x: 650, y: 510 }, 51: { x: 600, y: 500 }, 52: { x: 670, y: 530 },
  61: { x: 500, y: 480 }, 62: { x: 480, y: 510 }, 63: { x: 460, y: 530 }
};

/**
 * Procedural CAD Tiered Layout Engine.
 * Automatically organizes any uploaded model into clean horizontal voltage tiers
 * with right-angle orthogonal routing.
 */
function buildProceduralCADLayout(
  buses: BusData[],
  lines: LineData[],
  viewMode: 'schematic' | 'geographic'
): { positions: Record<string, Point>; viewBox: string } {
  if (!buses || buses.length === 0) {
    return { positions: {}, viewBox: '0 0 1000 650' };
  }

  const positions: Record<string, Point> = {};

  // 1. Geographic Mode
  if (viewMode === 'geographic') {
    buses.forEach((b) => {
      const geo = REGIONAL_GEOGRAPHIC_MAP[b.id] || { x: b.x || 300, y: b.y || 300 };
      positions[String(b.id)] = { ...geo };
    });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    Object.values(positions).forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const pad = 90;
    return {
      positions,
      viewBox: `${minX - pad} ${minY - pad} ${Math.max(800, maxX - minX + pad * 2)} ${Math.max(550, maxY - minY + pad * 2)}`,
    };
  }

  // 2. Schematic CAD Mode: Hierarchical Tier Partitioning
  // Tier 0: Power Infeeds & Generators (Kainji, Jebba, Shiroro, Egbin, etc.)
  // Tier 1: 330kV Bulk Switching Backbone & Interconnections
  // Tier 2: Regional Hubs & Sub-Transmission Interconnects
  // Tier 3: Major Load Centers & Terminal Demand Sinks
  const tierGenerators: BusData[] = [];
  const tierSwitching: BusData[] = [];
  const tierIntermediate: BusData[] = [];
  const tierLoads: BusData[] = [];

  // Degree count per bus
  const degreeMap = new Map<number, number>();
  lines.forEach((l) => {
    degreeMap.set(l.from_bus, (degreeMap.get(l.from_bus) || 0) + 1);
    degreeMap.set(l.to_bus, (degreeMap.get(l.to_bus) || 0) + 1);
  });

  buses.forEach((bus) => {
    const isGen =
      bus.is_gen ||
      bus.p_mw < -1.0 ||
      bus.name.toLowerCase().includes('gs') ||
      bus.name.toLowerCase().includes('hydro') ||
      bus.name.toLowerCase().includes('ps');

    const isLoad =
      bus.is_load ||
      bus.p_mw > 1.0 ||
      bus.name.toLowerCase().includes('load');

    const deg = degreeMap.get(bus.id) || 1;

    if (isGen) {
      tierGenerators.push(bus);
    } else if (deg >= 4) {
      tierSwitching.push(bus);
    } else if (isLoad && deg <= 2) {
      tierLoads.push(bus);
    } else {
      tierIntermediate.push(bus);
    }
  });

  // Balance tiers if one group is completely empty
  const tiers = [tierGenerators, tierSwitching, tierIntermediate, tierLoads].filter(
    (t) => t.length > 0
  );

  const rowHeight = 170;
  const startY = 90;
  const busWidth = 100;

  tiers.forEach((tierBuses, rowIndex) => {
    const count = tierBuses.length;
    const spacingX = Math.max(160, Math.min(220, 1400 / Math.max(1, count)));
    const totalRowWidth = (count - 1) * spacingX;
    const startX = Math.max(100, 700 - totalRowWidth / 2);

    tierBuses.forEach((bus, colIndex) => {
      positions[String(bus.id)] = {
        x: startX + colIndex * spacingX,
        y: startY + rowIndex * rowHeight,
      };
    });
  });

  // Determine viewport bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  Object.values(positions).forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const pad = 100;
  const width = Math.max(900, maxX - minX + pad * 2);
  const height = Math.max(550, maxY - minY + pad * 2);

  return {
    positions,
    viewBox: `${minX - pad} ${minY - pad} ${width} ${height}`,
  };
}

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

  // Mouse & Touch Drag States
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mouseStart, setMouseStart] = useState({ x: 0, y: 0 });

  const touchState = useRef<{
    initialDist: number;
    initialZoom: number;
    startPan: Point;
    startTouch: Point;
    isPinching: boolean;
  }>({
    initialDist: 0,
    initialZoom: 1.0,
    startPan: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
    isPinching: false,
  });

  // Procedural CAD Engine Execution
  const { positions: nodePositions, viewBox } = useMemo(() => {
    return buildProceduralCADLayout(buses, lines, viewMode);
  }, [buses, lines, viewMode]);

  // Safe Position Lookup
  const getPos = (busId: number): Point | null => {
    return nodePositions[String(busId)] || nodePositions[busId] || null;
  };

  // Zoom & Pan Handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.2, 4.0));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.2, 0.35));
  const handleReset = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    onReset();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((z) => Math.min(Math.max(z + delta, 0.35), 4.0));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsMouseDown(true);
    setMouseStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown) return;
    setPanOffset({ x: e.clientX - mouseStart.x, y: e.clientY - mouseStart.y });
  };
  const handleMouseUp = () => setIsMouseDown(false);

  // Mobile Pinch-to-Zoom & Pan Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchState.current.isPinching = false;
      touchState.current.startPan = { ...panOffset };
      touchState.current.startTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      touchState.current.isPinching = true;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchState.current.initialDist = Math.hypot(dx, dy);
      touchState.current.initialZoom = zoomLevel;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !touchState.current.isPinching) {
      const dx = e.touches[0].clientX - touchState.current.startTouch.x;
      const dy = e.touches[0].clientY - touchState.current.startTouch.y;
      setPanOffset({
        x: touchState.current.startPan.x + dx,
        y: touchState.current.startPan.y + dy,
      });
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const currentDist = Math.hypot(dx, dy);
      if (touchState.current.initialDist > 0) {
        const ratio = currentDist / touchState.current.initialDist;
        setZoomLevel(Math.min(Math.max(touchState.current.initialZoom * ratio, 0.35), 4.0));
      }
    }
  };

  const handleTouchEnd = () => {
    touchState.current.isPinching = false;
  };

  const selectedBusLines = useMemo(() => {
    if (!selectedBus) return [];
    return lines.filter((l) => l.from_bus === selectedBus.id || l.to_bus === selectedBus.id);
  }, [selectedBus, lines]);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#500b50]">
              Single-Line Diagram (CAD & Vector Map)
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-[#500b50] flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span>Manhattan CAD</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {buses.length} Substations | {lines.length} Transmission Branches | 90° Orthogonal CAD Channels
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex rounded border border-slate-300 bg-white p-0.5 text-xs shadow-xs">
            <button
              onClick={() => setViewMode('schematic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition ${
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
              onClick={handleReset}
              className="p-1.5 hover:bg-slate-100 rounded border-l ml-0.5 text-slate-700"
              title="Reset View"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Reset Grid</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Vector Viewport Canvas */}
        <div
          className="lg:col-span-2 rounded-lg border border-slate-800 bg-[#090e1a] p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-lg select-none"
          style={{ touchAction: 'none' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <svg viewBox={viewBox} className="w-full h-[430px] sm:h-[490px]">
            <defs>
              <filter id="bus-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
              {/* Transmission Corridors (Manhattan Orthogonal CAD Routing) */}
              {lines.map((line) => {
                const pFrom = getPos(line.from_bus);
                const pTo = getPos(line.to_bus);
                if (!pFrom || !pTo) return null;

                const isTripped = trippedLines.includes(line.id);
                const strokeColor = isTripped
                  ? '#f43f5e'
                  : line.loading_percent > 85
                  ? '#fbbf24'
                  : '#10b981';

                let pathData = '';
                let midPoint: Point = { x: 0, y: 0 };

                if (viewMode === 'schematic') {
                  const busHalfWidth = 45;
                  const dy = pTo.y - pFrom.y;
                  const dx = pTo.x - pFrom.x;

                  if (Math.abs(dy) < 30) {
                    // Same Tier: loop into horizontal channel below
                    const yLoop = pFrom.y + 40;
                    pathData = `M ${pFrom.x} ${pFrom.y + 6} L ${pFrom.x} ${yLoop} L ${pTo.x} ${yLoop} L ${pTo.x} ${pTo.y + 6}`;
                    midPoint = { x: (pFrom.x + pTo.x) / 2, y: yLoop };
                  } else {
                    // Different Tiers: orthogonal dogleg
                    const fromEdgeY = dy > 0 ? pFrom.y + 6 : pFrom.y - 6;
                    const toEdgeY = dy > 0 ? pTo.y - 6 : pTo.y + 6;
                    const yChannel = (pFrom.y + pTo.y) / 2;

                    pathData = `M ${pFrom.x} ${fromEdgeY} L ${pFrom.x} ${yChannel} L ${pTo.x} ${yChannel} L ${pTo.x} ${toEdgeY}`;
                    midPoint = { x: (pFrom.x + pTo.x) / 2, y: yChannel };
                  }
                } else {
                  // Direct Geographic Corridor
                  pathData = `M ${pFrom.x} ${pFrom.y} L ${pTo.x} ${pTo.y}`;
                  midPoint = { x: (pFrom.x + pTo.x) / 2, y: (pFrom.y + pTo.y) / 2 };
                }

                return (
                  <g key={`corridor-${line.id}`} className="cursor-pointer group" onClick={() => toggleLine(line.id)}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isTripped ? 2.0 : 2.8}
                      strokeDasharray={isTripped ? '6 6' : 'none'}
                      className="transition-colors group-hover:stroke-white"
                    />

                    {/* N-1 Breaker Box */}
                    <g transform={`translate(${midPoint.x}, ${midPoint.y})`} className="transition-transform group-hover:scale-125">
                      <rect
                        x="-7"
                        y="-7"
                        width="14"
                        height="14"
                        rx="2"
                        fill={isTripped ? '#4c0519' : '#064e3b'}
                        stroke={isTripped ? '#f43f5e' : '#10b981'}
                        strokeWidth="1.8"
                      />
                    </g>

                    {/* Flow MW Tag */}
                    {!isTripped && (
                      <g transform={`translate(${midPoint.x}, ${midPoint.y - 14})`}>
                        <rect x="-24" y="-8" width="48" height="15" rx="3" fill="#090e1a" stroke="#334155" strokeWidth="1" />
                        <text x="0" y="3.5" fill="#f8fafc" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {line.flow_mw} MW
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Substations, Busbars, Generators & Load Symbols */}
              {buses.map((bus) => {
                const pos = getPos(bus.id);
                if (!pos) return null;

                const isSelected = selectedBus?.id === bus.id;
                const isUnder = bus.v_pu < 0.95;
                const isOver = bus.v_pu > 1.05;
                const busColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#10b981';

                const hasGen =
                  bus.is_gen ||
                  bus.p_mw < -1.0 ||
                  bus.name.toLowerCase().includes('gs') ||
                  bus.name.toLowerCase().includes('hydro') ||
                  bus.name.toLowerCase().includes('ps');

                const hasLoad =
                  bus.is_load ||
                  bus.p_mw > 1.0 ||
                  bus.name.toLowerCase().includes('load') ||
                  bus.name.toLowerCase().includes('ts');

                return (
                  <g
                    key={`busbar-${bus.id}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBus(bus);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Synchronous Generator Feeder Symbol */}
                    {hasGen && viewMode === 'schematic' && (
                      <g transform="translate(0, -32)">
                        <line x1="0" y1="26" x2="0" y2="11" stroke="#94a3b8" strokeWidth="2" />
                        <circle r="11" fill="#090e1a" stroke="#38bdf8" strokeWidth="2" />
                        <path d="M -5 0 Q -2.5 -4 0 0 Q 2.5 4 5 0" fill="none" stroke="#38bdf8" strokeWidth="1.8" />
                        <text x="0" y="-14" fill="#38bdf8" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {Math.abs(bus.p_mw) > 0 ? `${Math.abs(bus.p_mw).toFixed(0)}MW` : 'GEN'}
                        </text>
                      </g>
                    )}

                    {/* Load Feeder Arrow Symbol */}
                    {hasLoad && !hasGen && viewMode === 'schematic' && (
                      <g transform="translate(0, 18)">
                        <line x1="0" y1="-12" x2="0" y2="6" stroke="#94a3b8" strokeWidth="2" />
                        <path d="M 0 14 L -5 6 L 5 6 Z" fill="#fbbf24" stroke="#fbbf24" />
                        <text x="0" y="24" fill="#fbbf24" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {bus.p_mw > 0 ? `${bus.p_mw.toFixed(0)}MW` : 'LOAD'}
                        </text>
                      </g>
                    )}

                    {/* Copper Busbar */}
                    {viewMode === 'schematic' ? (
                      <>
                        <rect
                          x="-45"
                          y="-5.5"
                          width="90"
                          height="11"
                          rx="2.5"
                          fill={isSelected ? '#38bdf8' : busColor}
                          stroke="#090e1a"
                          strokeWidth="2"
                          filter={isSelected ? 'url(#bus-glow)' : undefined}
                          className="transition-all group-hover:brightness-125"
                        />
                        {/* Substation Name Label */}
                        <text
                          x="0"
                          y={hasLoad && !hasGen ? -12 : 22}
                          fill="#f8fafc"
                          fontSize="9.5"
                          fontFamily="sans-serif"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {bus.name.split(' ')[0]}
                        </text>
                        {/* Per-Unit Voltage */}
                        <text
                          x="0"
                          y={hasLoad && !hasGen ? -22 : 32}
                          fill={busColor}
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {bus.v_pu.toFixed(3)} pu
                        </text>
                      </>
                    ) : (
                      // Geographic Node
                      <>
                        <circle
                          r={isSelected ? 11 : 7}
                          fill={isSelected ? '#38bdf8' : busColor}
                          stroke="#090e1a"
                          strokeWidth="2"
                          filter={isSelected ? 'url(#bus-glow)' : undefined}
                          className="transition-all group-hover:scale-125"
                        />
                        <text x="12" y="4" fill="#f8fafc" fontSize="8.5" fontFamily="sans-serif" fontWeight="bold">
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
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h3 className="text-sm font-bold text-[#500b50] flex items-center gap-2">
                <Zap className="h-4 w-4" /> Substation Inspector
              </h3>
              <button
                onClick={() => window.print()}
                className="text-[11px] text-slate-500 hover:text-[#500b50] flex items-center gap-1 font-semibold"
                title="Print Audit"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Audit</span>
              </button>
            </div>

            {selectedBus ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Substation</span>
                      <span className="font-bold text-slate-900 text-sm">{selectedBus.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f5eff6] text-[#500b50] border border-[#500b50]/20">
                      {selectedBus.vn_kv || 330} kV
                    </span>
                  </div>
                  <span className="block text-[11px] text-slate-500 mt-1">{selectedBus.zone} Regional Zone</span>
                </div>

                {/* Telemetry Matrix */}
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Voltage (|V|)</span>
                    <span className={`font-bold ${selectedBus.v_pu < 0.95 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {selectedBus.v_pu.toFixed(3)} pu
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Phase Angle</span>
                    <span className="font-bold text-slate-800">{selectedBus.va_deg}°</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Active Power</span>
                    <span className="font-bold text-[#500b50]">{selectedBus.p_mw} MW</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Reactive Power</span>
                    <span className="font-bold text-amber-700">{selectedBus.q_mvar} MVAR</span>
                  </div>
                </div>

                {/* Connected Corridors with Inline Breaker Toggles */}
                {selectedBusLines.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Connected Corridors ({selectedBusLines.length})
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {selectedBusLines.map((l) => {
                        const isTripped = trippedLines.includes(l.id);
                        return (
                          <div
                            key={`connected-${l.id}`}
                            className="flex items-center justify-between p-2 rounded border border-slate-100 bg-slate-50 text-[11px]"
                          >
                            <span className="font-medium text-slate-800 truncate max-w-[130px]" title={l.name}>
                              {l.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-bold text-slate-600">
                                {l.loading_percent}%
                              </span>
                              <button
                                onClick={() => toggleLine(l.id)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  !isTripped ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                }`}
                              >
                                {!isTripped ? 'Trip' : 'Close'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded p-4">
                Click on any busbar in the diagram to inspect live bus telemetry and connected lines.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between items-center">
            <span>Pinch/Scroll to Zoom</span>
            <span className="text-[#500b50] font-bold">
              {viewMode === 'schematic' ? '● Manhattan CAD' : '● Regional Geo Map'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};