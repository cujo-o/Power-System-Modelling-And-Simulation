'use client';

import React, { useState, useRef, useMemo } from 'react';
import { BusData, LineData } from '@/types/grid';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Zap,
  RotateCcw,
  Layers,
  MapPin,
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

/**
 * Procedural Force-Directed Graph Layout Engine.
 * Automatically untangles and positions ANY uploaded electrical grid.
 */
function computeProceduralLayout(
  buses: BusData[],
  lines: LineData[],
  preferGeo: boolean
): { positions: Record<number, Point>; viewBox: string } {
  if (!buses || buses.length === 0) {
    return { positions: {}, viewBox: '0 0 1000 700' };
  }

  const positions: Record<number, Point> = {};
  const busMap = new Map<number, BusData>();
  buses.forEach((b) => busMap.set(b.id, b));

  // 1. Check if model has pre-existing distinct coordinates
  const hasDistinctCoords =
    buses.filter((b) => typeof b.x === 'number' && typeof b.y === 'number' && (b.x !== 0 || b.y !== 0)).length >=
    buses.length * 0.7;

  // Check variance so we don't use identical fallback coordinates
  let xVariance = 0;
  let yVariance = 0;
  if (hasDistinctCoords) {
    const meanX = buses.reduce((acc, b) => acc + (b.x || 0), 0) / buses.length;
    const meanY = buses.reduce((acc, b) => acc + (b.y || 0), 0) / buses.length;
    xVariance = buses.reduce((acc, b) => acc + Math.pow((b.x || 0) - meanX, 2), 0) / buses.length;
    yVariance = buses.reduce((acc, b) => acc + Math.pow((b.y || 0) - meanY, 2), 0) / buses.length;
  }

  const canUseModelCoords = hasDistinctCoords && xVariance > 100 && yVariance > 100;

  if (canUseModelCoords && preferGeo) {
    // Directly scale existing geographic coordinates
    buses.forEach((b) => {
      positions[b.id] = { x: b.x || 250, y: b.y || 250 };
    });
  } else {
    // 2. Procedural Spring-Embedder Simulation
    // Arrange initially along a circle/spiral
    const n = buses.length;
    const radius = Math.max(220, Math.sqrt(n) * 65);
    const cx = 500;
    const cy = 380;

    buses.forEach((b, i) => {
      const angle = (2 * Math.PI * i) / n;
      positions[b.id] = {
        x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
        y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
      };
    });

    // Run force-directed iterations (Repulsion + Spring Attraction)
    const iterations = Math.min(100, Math.max(45, Math.floor(1200 / Math.max(10, n))));
    const kRepel = Math.max(120, Math.min(300, 1800 / Math.sqrt(n))); // Ideal distance
    const kRepelSq = kRepel * kRepel;

    for (let iter = 0; iter < iterations; iter++) {
      const disp: Record<number, Point> = {};
      buses.forEach((b) => (disp[b.id] = { x: 0, y: 0 }));

      // Coulomb Repulsion between all bus pairs
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const idA = buses[i].id;
          const idB = buses[j].id;
          const pA = positions[idA];
          const pB = positions[idB];

          const dx = pA.x - pB.x;
          const dy = pA.y - pB.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;

          if (dist < kRepel * 2.8) {
            const force = (kRepelSq / dist) * 0.45;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            disp[idA].x += fx;
            disp[idA].y += fy;
            disp[idB].x -= fx;
            disp[idB].y -= fy;
          }
        }
      }

      // Hooke's Law Spring Attraction along transmission lines
      lines.forEach((line) => {
        const pFrom = positions[line.from_bus];
        const pTo = positions[line.to_bus];
        if (!pFrom || !pTo) return;

        const dx = pTo.x - pFrom.x;
        const dy = pTo.y - pFrom.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;

        const springForce = ((dist * dist) / kRepel) * 0.08;
        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        disp[line.from_bus].x += fx;
        disp[line.from_bus].y += fy;
        disp[line.to_bus].x -= fx;
        disp[line.to_bus].y -= fy;
      });

      // Apply displacements with temperature cooling
      const temp = (1.0 - iter / iterations) * 22;
      buses.forEach((b) => {
        const d = disp[b.id];
        const dLen = Math.sqrt(d.x * d.x + d.y * d.y) || 1.0;
        const cap = Math.min(dLen, temp);

        positions[b.id].x += (d.x / dLen) * cap;
        positions[b.id].y += (d.y / dLen) * cap;
      });
    }
  }

  // 3. Compute dynamic SVG ViewBox to fit the procedural layout
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  Object.values(positions).forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const pad = 120;
  const w = Math.max(900, maxX - minX + pad * 2);
  const h = Math.max(550, maxY - minY + pad * 2);

  return {
    positions,
    viewBox: `${minX - pad} ${minY - pad} ${w} ${h}`,
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
    startPan: { x: number; y: number };
    startTouch: { x: number; y: number };
    isPinching: boolean;
  }>({
    initialDist: 0,
    initialZoom: 1.0,
    startPan: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
    isPinching: false,
  });

  // Execute procedural graph layout dynamically for ANY uploaded model
  const { positions: nodePositions, viewBox } = useMemo(() => {
    return computeProceduralLayout(buses, lines, viewMode === 'geographic');
  }, [buses, lines, viewMode]);

  // Zoom & Pan Handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 4.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.3));
  const handleReset = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    onReset();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((z) => Math.min(Math.max(z + delta, 0.3), 4.5));
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

  // Native Mobile Pinch-to-Zoom & Pan Handlers
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
        setZoomLevel(Math.min(Math.max(touchState.current.initialZoom * ratio, 0.3), 4.5));
      }
    }
  };

  const handleTouchEnd = () => {
    touchState.current.isPinching = false;
  };

  // Connected lines for the inspector side panel
  const selectedBusLines = useMemo(() => {
    if (!selectedBus) return [];
    return lines.filter((l) => l.from_bus === selectedBus.id || l.to_bus === selectedBus.id);
  }, [selectedBus, lines]);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#500b50]">
              Interactive Single-Line Diagram
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-[#500b50] flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span>Procedural Layout</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {buses.length} Substations | {lines.length} Transmission Branches | Dynamic connectivity without fixed mappings.
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

          {/* Zoom and Pan Toolbar */}
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
        {/* Dynamic Procedural SVG Canvas */}
        <div
          className="lg:col-span-2 rounded-lg border border-slate-800 bg-[#0c1427] p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-md select-none"
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
          <svg viewBox={viewBox} className="w-full h-[420px] sm:h-[480px]">
            <defs>
              <filter id="bus-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
              {/* Transmission Corridors dynamically connected from from_bus to to_bus */}
              {lines.map((line) => {
                const pFrom = nodePositions[line.from_bus];
                const pTo = nodePositions[line.to_bus];
                if (!pFrom || !pTo) return null;

                const isTripped = trippedLines.includes(line.id);
                const midX = (pFrom.x + pTo.x) / 2;
                const midY = (pFrom.y + pTo.y) / 2;

                const strokeColor = isTripped
                  ? '#f43f5e'
                  : line.loading_percent > 85
                  ? '#fbbf24'
                  : '#10b981';

                return (
                  <g key={`line-${line.id}`} className="cursor-pointer group" onClick={() => toggleLine(line.id)}>
                    <line
                      x1={pFrom.x}
                      y1={pFrom.y}
                      x2={pTo.x}
                      y2={pTo.y}
                      stroke={strokeColor}
                      strokeWidth={isTripped ? 2 : 2.5}
                      strokeDasharray={isTripped ? '6 6' : 'none'}
                      className="transition-colors group-hover:stroke-white"
                    />

                    {/* N-1 Breaker Box at branch center */}
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

                    {/* Active Power Flow MW Badge */}
                    {!isTripped && (
                      <g transform={`translate(${midX}, ${midY - 12})`}>
                        <rect x="-24" y="-8" width="48" height="15" rx="3" fill="#090e1a" stroke="#334155" strokeWidth="1" />
                        <text x="0" y="3.5" fill="#f8fafc" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {line.flow_mw} MW
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Substations, Generators, and Load Feeders */}
              {buses.map((bus) => {
                const pos = nodePositions[bus.id];
                if (!pos) return null;

                const isSelected = selectedBus?.id === bus.id;
                const isUnder = bus.v_pu < 0.95;
                const isOver = bus.v_pu > 1.05;
                const busColor = isUnder ? '#f43f5e' : isOver ? '#fbbf24' : '#10b981';

                const hasGen =
                  bus.is_gen ||
                  bus.p_mw < -1.0 ||
                  bus.name.toLowerCase().includes('gs') ||
                  bus.name.toLowerCase().includes('hydro');
                const hasLoad =
                  bus.is_load ||
                  bus.p_mw > 1.0 ||
                  bus.name.toLowerCase().includes('load') ||
                  bus.name.toLowerCase().includes('ts');

                return (
                  <g
                    key={`bus-${bus.id}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBus(bus);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Synchronous Generator Feeder Symbol */}
                    {hasGen && viewMode === 'schematic' && (
                      <g transform="translate(0, -28)">
                        <line x1="0" y1="24" x2="0" y2="10" stroke="#94a3b8" strokeWidth="1.5" />
                        <circle r="10" fill="#0c1427" stroke="#38bdf8" strokeWidth="1.8" />
                        <path d="M -5 0 Q -2.5 -4 0 0 Q 2.5 4 5 0" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
                        <text x="0" y="-13" fill="#38bdf8" fontSize="7.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {Math.abs(bus.p_mw) > 0 ? `${Math.abs(bus.p_mw).toFixed(0)}MW` : 'GEN'}
                        </text>
                      </g>
                    )}

                    {/* Load Feeder Arrow Symbol */}
                    {hasLoad && !hasGen && viewMode === 'schematic' && (
                      <g transform="translate(0, 16)">
                        <line x1="0" y1="-12" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1.5" />
                        <path d="M 0 13 L -4.5 5 L 4.5 5 Z" fill="#fbbf24" stroke="#fbbf24" />
                        <text x="0" y="23" fill="#fbbf24" fontSize="7.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {bus.p_mw > 0 ? `${bus.p_mw.toFixed(0)}MW` : 'LOAD'}
                        </text>
                      </g>
                    )}

                    {/* Substation Bus Body */}
                    {viewMode === 'schematic' ? (
                      <>
                        <rect
                          x="-32"
                          y="-4.5"
                          width="64"
                          height="9"
                          rx="2"
                          fill={isSelected ? '#38bdf8' : busColor}
                          stroke="#0a0f1d"
                          strokeWidth="1.5"
                          filter={isSelected ? 'url(#bus-glow)' : undefined}
                          className="transition-all group-hover:brightness-125"
                        />
                        <text
                          x="0"
                          y={hasLoad && !hasGen ? -10 : 20}
                          fill="#f8fafc"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {bus.name.split(' ')[0]}
                        </text>
                        <text
                          x="0"
                          y={hasLoad && !hasGen ? -20 : 30}
                          fill={busColor}
                          fontSize="7.5"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {bus.v_pu.toFixed(2)} pu
                        </text>
                      </>
                    ) : (
                      <>
                        <circle
                          r={isSelected ? 10 : 6.5}
                          fill={isSelected ? '#38bdf8' : busColor}
                          stroke="#0a0f1d"
                          strokeWidth="2"
                          filter={isSelected ? 'url(#bus-glow)' : undefined}
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
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h3 className="text-sm font-bold text-[#500b50] flex items-center gap-2">
                <Zap className="h-4 w-4" /> Substation Inspector
              </h3>
              <button
                onClick={() => window.print()}
                className="text-[11px] text-slate-500 hover:text-[#500b50] flex items-center gap-1 font-semibold"
                title="Print Audit Report"
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

                {/* Connected Corridors with Inline Breaker Control */}
                {selectedBusLines.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Connected Branches ({selectedBusLines.length})
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
            <span className="text-[#500b50] font-bold">● Active Telemetry</span>
          </div>
        </div>
      </div>
    </div>
  );
};