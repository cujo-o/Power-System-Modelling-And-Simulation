'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BusData, LineData } from '@/types/grid';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Layers,
  MapPin,
  Download,
  Image as ImageIcon,
  FileSpreadsheet,
  Zap,
  Info,
} from 'lucide-react';

interface SingleLineDiagramProps {
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  toggleLine: (id: number) => void;
  selectedBus: BusData | null;
  setSelectedBus: (bus: BusData | null) => void;
  onReset: () => void;
  modelName: string;
}

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = ({
  buses = [],
  lines = [],
  trippedLines = [],
  toggleLine,
  selectedBus,
  setSelectedBus,
  onReset,
  modelName,
}) => {
  const [viewMode, setViewMode] = useState<'nig_bus' | 'geographic'>('nig_bus');

  // Canvas Pan & Zoom State
  const [scale, setScale] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 30 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const resetViewport = () => {
    if (viewMode === 'nig_bus') {
      setScale(0.85);
      setPan({ x: 50, y: 30 });
    } else {
      setScale(1.0);
      setPan({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    resetViewport();
  }, [viewMode, modelName]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    setScale((prev) => Math.min(3.5, Math.max(0.25, prev * zoomFactor)));
  };

  // =========================================================================
  // 1. STANDARD NIG BUS COORDINATES (Orthogonal SLD Hierarchy)
  // =========================================================================
  const nigBusCoordinates = useMemo(() => {
    const coords = new Map<number, { x: number; y: number; isGen: boolean }>();
    if (!buses || buses.length === 0) return coords;

    const genBuses: BusData[] = [];
    const bulkBuses: BusData[] = [];
    const subBuses: BusData[] = [];

    buses.forEach((b) => {
      const isGen =
        (b.p_mw ?? 0) < -20 ||
        (b.name || '').toLowerCase().includes('gs') ||
        (b.name || '').toLowerCase().includes('ps') ||
        (b.name || '').toLowerCase().includes('slack') ||
        (b.name || '').toLowerCase().includes('ipp') ||
        (b.name || '').toLowerCase().includes('hydro');

      if (isGen) genBuses.push(b);
      else if ((b.vn_kv && b.vn_kv >= 330) || (b.p_mw ?? 0) > 80) bulkBuses.push(b);
      else subBuses.push(b);
    });

    const xPitch = 280; // Standard spacing between substations
    const yGen = 120;
    const yBulk = 340;
    const ySub = 580;

    // Tier 1: Generating Power Plants
    genBuses.forEach((b, i) => {
      coords.set(b.id, { x: 140 + i * xPitch, y: yGen, isGen: true });
    });

    // Tier 2: 330kV Bulk Backbone Substations
    bulkBuses.forEach((b, i) => {
      const row = Math.floor(i / 8);
      const col = i % 8;
      coords.set(b.id, { x: 140 + col * xPitch, y: yBulk + row * 160, isGen: false });
    });

    // Tier 3: Regional Infeed & Sub-transmission
    subBuses.forEach((b, i) => {
      const row = Math.floor(i / 7);
      const col = i % 7;
      coords.set(b.id, { x: 180 + col * (xPitch * 1.05), y: ySub + row * 160, isGen: false });
    });

    return coords;
  }, [buses]);

  // =========================================================================
  // 2. GEOGRAPHIC NIGERIAN VECTOR MAP COORDINATES
  // =========================================================================
  const geoCoordinates = useMemo(() => {
    const coords = new Map<number, { x: number; y: number }>();
    if (!buses || buses.length === 0) return coords;

    const GEO_ANCHORS: Record<string, { x: number; y: number }> = {
      kainji: { x: 380, y: 320 },
      jebba: { x: 420, y: 410 },
      shiroro: { x: 620, y: 340 },
      katampe: { x: 740, y: 380 },
      abuja: { x: 760, y: 390 },
      osogbo: { x: 450, y: 550 },
      ikeja: { x: 340, y: 690 },
      egbin: { x: 400, y: 700 },
      benin: { x: 600, y: 640 },
      delta: { x: 640, y: 760 },
      afam: { x: 780, y: 780 },
      alaoji: { x: 800, y: 740 },
      kaduna: { x: 680, y: 260 },
      kano: { x: 790, y: 160 },
      jos: { x: 890, y: 340 },
      gombe: { x: 1080, y: 300 },
      yola: { x: 1220, y: 460 },
      makurdi: { x: 880, y: 540 },
      onitsha: { x: 720, y: 670 },
      calabar: { x: 920, y: 770 },
    };

    buses.forEach((b, idx) => {
      const name = (b.name || '').toLowerCase();
      let matched = null;
      for (const [key, pos] of Object.entries(GEO_ANCHORS)) {
        if (name.includes(key)) {
          matched = pos;
          break;
        }
      }

      if (matched) {
        const jx = ((idx % 3) - 1) * 28;
        const jy = (((idx * 2) % 3) - 1) * 24;
        coords.set(b.id, { x: matched.x * 1.5 + jx, y: matched.y * 1.3 + jy });
      } else {
        const col = idx % 8;
        const row = Math.floor(idx / 8);
        coords.set(b.id, { x: 200 + col * 210, y: 180 + row * 160 });
      }
    });

    return coords;
  }, [buses]);

  // =========================================================================
  // EXPORT SUITE (PNG, SVG, CSV)
  // =========================================================================
  const exportAsPNG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `NESI_Single_Line_Diagram_${viewMode === 'nig_bus' ? 'NIG_Bus' : 'Geographic'}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const exportAsSVG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESI_Single_Line_Diagram_${viewMode === 'nig_bus' ? 'NIG_Bus' : 'Geographic'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = () => {
    let csv = 'ELEMENT,ID,NAME,FROM_BUS,TO_BUS,FLOW_MW,LOADING_PERCENT,VOLTAGE_PU,STATUS\n';
    buses.forEach((b) => {
      const vVal = b.v_pu ?? 1.0;
      csv += `BUS,#${b.id},"${b.name}",-,-,${b.p_mw ?? 0},-,${vVal.toFixed(3)},${
        vVal < 0.95 ? 'UNDERVOLTAGE' : vVal > 1.05 ? 'OVERVOLTAGE' : 'COMPLIANT'
      }\n`;
    });
    lines.forEach((l) => {
      const isTripped = trippedLines.includes(l.id);
      const flow = l.flow_mw ?? l.p_mw ?? 0;
      const load = l.loading_percent ?? 0;
      csv += `LINE,#${l.id},"${l.name}",#${l.from_bus},#${l.to_bus},${isTripped ? 0 : flow.toFixed(1)},${
        isTripped ? 0 : load.toFixed(1)
      }%,-,${isTripped ? 'TRIPPED' : 'IN_SERVICE'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESI_NIG_Bus_Topology_${modelName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const connectedLines = useMemo(() => {
    if (!selectedBus) return [];
    return lines.filter((l) => l.from_bus === selectedBus.id || l.to_bus === selectedBus.id);
  }, [selectedBus, lines]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Single-Line Diagram (NIG Bus & Vector Map)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-[#500b50] border border-[#500b50]/20">
              {viewMode === 'nig_bus' ? 'NIG Bus' : 'Geographic Map'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {buses.length} Substations • {lines.length} Transmission Corridors •{' '}
            {trippedLines.length > 0 ? `${trippedLines.length} Lines Tripped ($N-1$)` : 'All Breakers In-Service'}
          </p>
        </div>

        {/* View & Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xs font-bold">
            <button
              onClick={() => setViewMode('nig_bus')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewMode === 'nig_bus' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>NIG Bus</span>
            </button>
            <button
              onClick={() => setViewMode('geographic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewMode === 'geographic' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="h-3.5 w-3.5 text-rose-500" />
              <span>Geographic Map</span>
            </button>
          </div>

          {/* Zoom Actions */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs text-xs font-mono">
            <button
              onClick={() => setScale((s) => Math.max(0.25, s * 0.85))}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="px-2 font-bold text-slate-700">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale((s) => Math.min(3.5, s * 1.15))}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={resetViewport}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 ml-1 border-l border-slate-100"
              title="Fit to Screen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Export Group */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs text-xs">
            <button
              onClick={exportAsPNG}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition"
              title="Export high-resolution PNG image"
            >
              <ImageIcon className="h-3.5 w-3.5 text-cyan-600" />
              <span>PNG</span>
            </button>
            <button
              onClick={exportAsSVG}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition border-l border-slate-100"
              title="Export vector SVG"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              <span>SVG</span>
            </button>
            <button
              onClick={exportAsCSV}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition border-l border-slate-100"
              title="Export CSV topology report"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
              <span>CSV</span>
            </button>
          </div>

          {/* Reset Baseline */}
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-xs transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Grid</span>
          </button>
        </div>
      </div>

      {/* Main SLD Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`lg:col-span-8 xl:col-span-9 h-[760px] w-full rounded-2xl border border-slate-800 bg-[#080c14] relative overflow-hidden shadow-2xl select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Engineering Banner */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none opacity-45">
            <Zap className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] font-mono tracking-widest text-slate-300 uppercase">
              330kV Bulk Synchronous Grid (NIG Bus)
            </span>
          </div>

          <div className="absolute bottom-4 right-4 z-10 pointer-events-none flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <span>Pinch / Scroll to Zoom • Drag to Pan Canvas</span>
          </div>

          {/* Vector SVG Canvas */}
          <svg ref={svgRef} className="w-full h-full" style={{ width: '100%', height: '100%' }}>
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              <defs>
                <pattern id="sldGridDots" width="50" height="50" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="0.8" fill="#1e293b" opacity="0.7" />
                </pattern>
              </defs>
              <rect x="-4000" y="-4000" width="12000" height="12000" fill="url(#sldGridDots)" pointerEvents="none" />

              {/* ========================================================================= */}
              {/* 1. TRANSMISSION LINES (STRICT 90° ORTHOGONAL SLD ROUTING - NO CURVES)    */}
              {/* ========================================================================= */}
              {lines.map((line) => {
                const posA = viewMode === 'nig_bus' ? nigBusCoordinates.get(line.from_bus) : geoCoordinates.get(line.from_bus);
                const posB = viewMode === 'nig_bus' ? nigBusCoordinates.get(line.to_bus) : geoCoordinates.get(line.to_bus);
                if (!posA || !posB) return null;

                const isTripped = trippedLines.includes(line.id);
                const loadingPercent = line.loading_percent ?? 0;
                const isOverload = loadingPercent > 100;
                const lineColor = isTripped ? '#ef4444' : isOverload ? '#f97316' : '#10b981';
                const flow = line.flow_mw ?? line.p_mw ?? 0;

                let pathString = '';
                let labelX = (posA.x + posB.x) / 2;
                let labelY = (posA.y + posB.y) / 2;

                if (viewMode === 'nig_bus') {
                  const dy = posB.y - posA.y;
                  const dx = posB.x - posA.x;
                  // Channel stagger prevents parallel horizontal lines from overlapping directly
                  const channelOffset = ((line.id * 17) % 50) - 25;

                  if (Math.abs(dy) < 15) {
                    // Same tier: drop vertical stub down, travel horizontal, return vertically
                    const dropY = posA.y + 40 + ((line.id % 6) * 14);
                    pathString = `M ${posA.x} ${posA.y} L ${posA.x} ${dropY} L ${posB.x} ${dropY} L ${posB.x} ${posB.y}`;
                    labelX = (posA.x + posB.x) / 2;
                    labelY = dropY;
                  } else {
                    // Different tiers: standard 90-degree Z-step routing
                    const midY = posA.y + dy * 0.5 + channelOffset;
                    pathString = `M ${posA.x} ${posA.y} L ${posA.x} ${midY} L ${posB.x} ${midY} L ${posB.x} ${posB.y}`;
                    labelX = posA.x + dx * 0.5;
                    labelY = midY;
                  }
                } else {
                  // Direct vector line on Geographic map
                  pathString = `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;
                }

                return (
                  <g key={`line-${line.id}`} className="group cursor-pointer" onClick={() => toggleLine(line.id)}>
                    {/* Invisible Thick Hover Zone */}
                    <path d={pathString} fill="none" stroke="transparent" strokeWidth="18" />

                    {/* Transmission Line (Strict 90-degree orthogonal path) */}
                    <path
                      d={pathString}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={isTripped ? 2 : Math.max(2, Math.min(4.5, (loadingPercent / 100) * 3.5))}
                      strokeDasharray={isTripped ? '6 4' : undefined}
                      strokeOpacity={isTripped ? 0.35 : 0.85}
                      strokeLinejoin="round"
                      strokeLinecap="square"
                      className="transition-all duration-150 group-hover:stroke-cyan-300 group-hover:stroke-width-3"
                    />

                    {/* Rectangular Inline Breaker Graphic */}
                    <g transform={`translate(${labelX}, ${labelY})`}>
                      <rect
                        x="-28"
                        y="-8.5"
                        width="56"
                        height="17"
                        rx="3"
                        fill="#080c14"
                        stroke={lineColor}
                        strokeWidth="1.2"
                      />
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        fontSize="8.5"
                        fill={isTripped ? '#f87171' : isOverload ? '#fdba74' : '#a7f3d0'}
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {isTripped ? 'OPEN' : `${flow.toFixed(1)}M`}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* ========================================================================= */}
              {/* 2. SUBSTATION BUSBARS & OFFICIAL SYMBOLS                                  */}
              {/* ========================================================================= */}
              {buses.map((bus) => {
                const pos = viewMode === 'nig_bus' ? nigBusCoordinates.get(bus.id) : geoCoordinates.get(bus.id);
                if (!pos) return null;

                const isSelected = selectedBus?.id === bus.id;
                const vVal = bus.v_pu ?? 1.0;
                const isUnder = vVal < 0.95;
                const isOver = vVal > 1.05;
                const busColor = isUnder ? '#f43f5e' : isOver ? '#f59e0b' : '#10b981';

                const isGen =
                  (bus.p_mw ?? 0) < -20 ||
                  (bus.name || '').toLowerCase().includes('gs') ||
                  (bus.name || '').toLowerCase().includes('ps') ||
                  (bus.name || '').toLowerCase().includes('slack');

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
                    {/* Selection Beacon */}
                    {isSelected && (
                      <rect
                        x="-52"
                        y="-20"
                        width="104"
                        height="40"
                        rx="6"
                        fill="#a855f7"
                        fillOpacity="0.18"
                        stroke="#c084fc"
                        strokeWidth="1.8"
                      />
                    )}

                    {/* Generator Symbol: Circle with ~ Sine Wave & Vertical Feeder */}
                    {isGen && (
                      <g transform="translate(0, -32)">
                        <line x1="0" y1="14" x2="0" y2="32" stroke="#38bdf8" strokeWidth="2" />
                        <circle cx="0" cy="0" r="13" fill="#080c14" stroke="#38bdf8" strokeWidth="2" />
                        <path
                          d="M -6 0 Q -3 -5 0 0 T 6 0"
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="-17"
                          textAnchor="middle"
                          fontSize="9"
                          fill="#38bdf8"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {Math.abs(bus.p_mw ?? 0).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* Substation Busbar (Standard Heavy Horizontal Copper Bar) */}
                    <line
                      x1="-45"
                      y1="0"
                      x2="45"
                      y2="0"
                      stroke={busColor}
                      strokeWidth={isSelected ? '7' : '5.5'}
                      strokeLinecap="square"
                      className="transition-all duration-150 group-hover:stroke-purple-300"
                    />

                    {/* Station Name Label with Solid Backdrop */}
                    <text
                      x="0"
                      y="16"
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="bold"
                      fill="#ffffff"
                      fontFamily="sans-serif"
                      stroke="#080c14"
                      strokeWidth="3"
                      style={{ paintOrder: 'stroke fill' }}
                    >
                      {bus.name}
                    </text>

                    {/* Voltage Telemetry Pill */}
                    <text
                      x="0"
                      y="28"
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={busColor}
                      stroke="#080c14"
                      strokeWidth="2.5"
                      style={{ paintOrder: 'stroke fill' }}
                    >
                      {vVal.toFixed(3)} pu
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Substation Inspector Drawer */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-[#500b50]" />
                <h3 className="text-sm font-bold text-slate-900">Substation Inspector</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Live Telemetry</span>
            </div>

            {selectedBus ? (
              <div className="mt-4 space-y-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Station Bus Node
                  </span>
                  <h4 className="text-base font-black text-slate-900">{selectedBus.name}</h4>
                  <span className="text-xs text-slate-500 font-mono">
                    Bus #{selectedBus.id} • {selectedBus.zone || '330kV Bulk Substation'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Voltage Profile</span>
                    <span
                      className={`text-base font-bold ${
                        (selectedBus.v_pu ?? 1.0) < 0.95
                          ? 'text-rose-600'
                          : (selectedBus.v_pu ?? 1.0) > 1.05
                          ? 'text-amber-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {(selectedBus.v_pu ?? 1.0).toFixed(3)} pu
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Phase Angle</span>
                    <span className="text-base font-bold text-slate-800">
                      {(selectedBus.va_deg ?? 0.0).toFixed(2)}°
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Active Power</span>
                    <span className="text-base font-bold text-[#500b50]">
                      {(selectedBus.p_mw ?? 0).toFixed(1)} MW
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Reactive Power</span>
                    <span className="text-base font-bold text-slate-800">
                      {(selectedBus.q_mvar ?? 0).toFixed(1)} MVAR
                    </span>
                  </div>
                </div>

                {/* Connected Corridors */}
                <div className="pt-2">
                  <span className="text-xs font-bold text-slate-700 block mb-2">
                    Connected Corridors ({connectedLines.length})
                  </span>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {connectedLines.map((line) => {
                      const isTripped = trippedLines.includes(line.id);
                      const flow = line.flow_mw ?? line.p_mw ?? 0;
                      const loading = line.loading_percent ?? 0;

                      return (
                        <div
                          key={line.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                            isTripped ? 'bg-rose-50/50 border-rose-200' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="font-bold text-slate-900 block truncate">{line.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {flow.toFixed(1)} MW ({loading.toFixed(1)}% load)
                            </span>
                          </div>
                          <button
                            onClick={() => toggleLine(line.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                              isTripped ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                            }`}
                          >
                            {isTripped ? 'Reclose' : 'Trip'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 text-xs">
                Click on any substation busbar in the NIG Bus diagram to inspect bus telemetry and operate breakers.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};