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
  Power,
  Zap,
  ShieldCheck,
  ShieldAlert,
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

  // Infinite Canvas Pan & Zoom State
  const [scale, setScale] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Auto-fit view when switching models or views
  const resetViewport = () => {
    if (viewMode === 'schematic') {
      setScale(0.85);
      setPan({ x: 40, y: 30 });
    } else {
      setScale(1.0);
      setPan({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    resetViewport();
  }, [viewMode, modelName]);

  // Mouse Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary button
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

  // Wheel Zoom Handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    setScale((prev) => Math.min(3.5, Math.max(0.3, prev * zoomFactor)));
  };

  // =========================================================================
  // 1. SCHEMATIC CAD LAYOUT SYNTHESIS (Spaced Out Manhattan Coordinates)
  // =========================================================================
  const schematicCoordinates = useMemo(() => {
    const coords = new Map<number, { x: number; y: number; isGen: boolean }>();
    if (!buses || buses.length === 0) return coords;

    // Distinguish generators vs bulk vs distribution substations
    const genBuses: BusData[] = [];
    const mainBuses: BusData[] = [];
    const subBuses: BusData[] = [];

    buses.forEach((b) => {
      const isGen =
        b.p_mw < -20 ||
        b.name.toLowerCase().includes('gs') ||
        b.name.toLowerCase().includes('ps') ||
        b.name.toLowerCase().includes('slack') ||
        b.name.toLowerCase().includes('ipp') ||
        b.name.toLowerCase().includes('kainji') ||
        b.name.toLowerCase().includes('egbin') ||
        b.name.toLowerCase().includes('shiroro') ||
        b.name.toLowerCase().includes('delta');

      if (isGen) genBuses.push(b);
      else if ((b.vn_kv && b.vn_kv >= 330) || b.p_mw > 100) mainBuses.push(b);
      else subBuses.push(b);
    });

    const xPitch = 260; // Wide horizontal spacing (breathing room)
    const yTop = 130;
    const yMid = 340;
    const yBottom = 570;

    // Tier 1: Generating Stations
    genBuses.forEach((b, i) => {
      coords.set(b.id, { x: 140 + i * xPitch, y: yTop, isGen: true });
    });

    // Tier 2: 330 kV Bulk Transmission Backbone
    mainBuses.forEach((b, i) => {
      coords.set(b.id, { x: 140 + (i % 8) * xPitch, y: yMid + Math.floor(i / 8) * 160, isGen: false });
    });

    // Tier 3: Regional Sub-transmission & Infeed Nodes
    subBuses.forEach((b, i) => {
      coords.set(b.id, { x: 180 + (i % 7) * (xPitch * 1.1), y: yBottom + Math.floor(i / 7) * 160, isGen: false });
    });

    return coords;
  }, [buses]);

  // =========================================================================
  // 2. GEOGRAPHIC NIGERIAN VECTOR MAP SYNTHESIS (Dispersed Coordinates)
  // =========================================================================
  const geoCoordinates = useMemo(() => {
    const coords = new Map<number, { x: number; y: number }>();
    if (!buses || buses.length === 0) return coords;

    // Geographic anchors for major hubs in Nigeria (lat/long approximate map)
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
      const name = b.name.toLowerCase();
      let matched = null;
      for (const [key, pos] of Object.entries(GEO_ANCHORS)) {
        if (name.includes(key)) {
          matched = pos;
          break;
        }
      }

      if (matched) {
        // Apply slight offset so multi-bus stations don't stack
        const jitterX = ((idx % 3) - 1) * 28;
        const jitterY = (((idx * 2) % 3) - 1) * 24;
        coords.set(b.id, { x: matched.x * 1.5 + jitterX, y: matched.y * 1.3 + jitterY });
      } else {
        // Disperse unmapped regional buses into spatial grid
        const col = idx % 8;
        const row = Math.floor(idx / 8);
        coords.set(b.id, { x: 200 + col * 210, y: 180 + row * 160 });
      }
    });

    return coords;
  }, [buses]);

  // =========================================================================
  // EXPORT CAPABILITIES (PNG, SVG, CSV)
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
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `NESI_Single_Line_Diagram_${viewMode}.png`;
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
    a.download = `NESI_Single_Line_Diagram_${viewMode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = () => {
    let csv = 'ELEMENT,ID,NAME,FROM_BUS,TO_BUS,FLOW_MW,LOADING_PERCENT,VOLTAGE_PU,STATUS\n';
    buses.forEach((b) => {
      csv += `BUS,#${b.id},"${b.name}",-,-,${b.p_mw},-,${b.v_pu.toFixed(3)},${b.v_pu < 0.95 ? 'UNDERVOLTAGE' : b.v_pu > 1.05 ? 'OVERVOLTAGE' : 'COMPLIANT'}\n`;
    });
    lines.forEach((l) => {
      const isTripped = trippedLines.includes(l.id);
      csv += `LINE,#${l.id},"${l.name}",#${l.from_bus},#${l.to_bus},${isTripped ? 0 : l.flow_mw.toFixed(1)},${isTripped ? 0 : l.loading_percent.toFixed(1)}%,-,${isTripped ? 'TRIPPED' : 'IN_SERVICE'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESI_Grid_Topology_Audit_${modelName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Connected corridors for the inspector sidebar
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
              Single-Line Diagram (CAD & Vector Map)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-[#500b50] border border-[#500b50]/20">
              {viewMode === 'schematic' ? 'Manhattan CAD' : 'Geographic Map'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {buses.length} Substations • {lines.length} Transmission Corridors •{' '}
            {trippedLines.length > 0 ? `${trippedLines.length} Lines Tripped ($N-1$)` : 'All Breakers Closed'}
          </p>
        </div>

        {/* View & Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xs font-bold">
            <button
              onClick={() => setViewMode('schematic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewMode === 'schematic' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Schematic CAD</span>
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

          {/* Zoom & Navigation Actions */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs text-xs font-mono">
            <button
              onClick={() => setScale((s) => Math.max(0.3, s * 0.85))}
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

          {/* Export Dropdown Group */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs text-xs">
            <button
              onClick={exportAsPNG}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition"
              title="Export high-resolution PNG"
            >
              <ImageIcon className="h-3.5 w-3.5 text-cyan-600" />
              <span>PNG</span>
            </button>
            <button
              onClick={exportAsSVG}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition border-l border-slate-100"
              title="Export scalable SVG"
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

      {/* Main CAD Workspace Layout (Expanded to 750px Height) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Vector Canvas Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`lg:col-span-8 xl:col-span-9 h-[750px] w-full rounded-2xl border border-slate-800 bg-[#090d16] relative overflow-hidden shadow-2xl select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Subtle Grid Watermark & Compass */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none opacity-40">
            <Zap className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] font-mono tracking-widest text-slate-300 uppercase">
              330kV Bulk Synchronous Grid CAD
            </span>
          </div>

          <div className="absolute bottom-4 right-4 z-10 pointer-events-none flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <span>Pinch / Scroll to Zoom • Drag to Pan</span>
          </div>

          {/* SVG Vector Workspace */}
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ width: '100%', height: '100%' }}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* Subtle background coordinate grid dots */}
              <defs>
                <pattern id="cadGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1" fill="#1e293b" opacity="0.6" />
                </pattern>
              </defs>
              <rect x="-3000" y="-3000" width="9000" height="9000" fill="url(#cadGrid)" pointerEvents="none" />

              {/* ========================================================================= */}
              {/* 1. TRANSMISSION LINES (CAD PATHS & ORTHOGONAL ROUTING)                     */}
              {/* ========================================================================= */}
              {lines.map((line) => {
                const posA = viewMode === 'schematic' ? schematicCoordinates.get(line.from_bus) : geoCoordinates.get(line.from_bus);
                const posB = viewMode === 'schematic' ? schematicCoordinates.get(line.to_bus) : geoCoordinates.get(line.to_bus);
                if (!posA || !posB) return null;

                const isTripped = trippedLines.includes(line.id);
                const isOverload = line.loading_percent > 100;
                const lineColor = isTripped ? '#ef4444' : isOverload ? '#f97316' : '#10b981';

                // Midpoint for Flow Pill
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                // Orthogonal routing for Schematic, Direct Vector for Geo
                let pathString = '';
                if (viewMode === 'schematic') {
                  const deltaY = posB.y - posA.y;
                  pathString = `M ${posA.x} ${posA.y} C ${posA.x} ${posA.y + deltaY * 0.45}, ${posB.x} ${posB.y - deltaY * 0.45}, ${posB.x} ${posB.y}`;
                } else {
                  pathString = `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;
                }

                return (
                  <g key={`line-${line.id}`} className="group cursor-pointer" onClick={() => toggleLine(line.id)}>
                    {/* Invisible Thick Hover Target */}
                    <path d={pathString} fill="none" stroke="transparent" strokeWidth="18" />

                    {/* Visible Line */}
                    <path
                      d={pathString}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={isTripped ? 2 : Math.max(2, Math.min(5, (line.loading_percent / 100) * 4))}
                      strokeDasharray={isTripped ? '6 4' : undefined}
                      strokeOpacity={isTripped ? 0.4 : 0.85}
                      className="transition-all duration-150 group-hover:stroke-cyan-300 group-hover:stroke-width-4"
                    />

                    {/* Flow MW Tag with Dark Shield Backdrop (No collisions) */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x="-30"
                        y="-9"
                        width="60"
                        height="18"
                        rx="4"
                        fill="#090d16"
                        stroke={lineColor}
                        strokeWidth="1"
                        fillOpacity="0.9"
                      />
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        fontSize="9"
                        fill={isTripped ? '#f87171' : isOverload ? '#fdba74' : '#a7f3d0'}
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {isTripped ? 'TRIPPED' : `${line.flow_mw.toFixed(1)} MW`}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* ========================================================================= */}
              {/* 2. SUBSTATION BUSES (Generators, Busbars & Loads)                         */}
              {/* ========================================================================= */}
              {buses.map((bus) => {
                const pos = viewMode === 'schematic' ? schematicCoordinates.get(bus.id) : geoCoordinates.get(bus.id);
                if (!pos) return null;

                const isSelected = selectedBus?.id === bus.id;
                const isUnder = bus.v_pu < 0.95;
                const isOver = bus.v_pu > 1.05;
                const busColor = isUnder ? '#f43f5e' : isOver ? '#f59e0b' : '#10b981';

                const isGen =
                  bus.p_mw < -20 ||
                  bus.name.toLowerCase().includes('gs') ||
                  bus.name.toLowerCase().includes('ps') ||
                  bus.name.toLowerCase().includes('slack');

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
                      <circle cx="0" cy="0" r="42" fill="#a855f7" fillOpacity="0.2" stroke="#c084fc" strokeWidth="2" />
                    )}

                    {/* Generator Icon on Top of Bus (If applicable) */}
                    {isGen && (
                      <g transform="translate(0, -32)">
                        <circle cx="0" cy="0" r="14" fill="#090d16" stroke="#38bdf8" strokeWidth="2" />
                        <path
                          d="M -7 0 Q -3.5 -6 0 0 T 7 0"
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="-18"
                          textAnchor="middle"
                          fontSize="9"
                          fill="#38bdf8"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {Math.abs(bus.p_mw).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* Heavy Copper/Aluminum Busbar Element */}
                    <line
                      x1="-40"
                      y1="0"
                      x2="40"
                      y2="0"
                      stroke={busColor}
                      strokeWidth={isSelected ? '8' : '6'}
                      strokeLinecap="round"
                      className="transition-all duration-150 group-hover:stroke-purple-300"
                    />

                    {/* Substation Name Label (Clean backdrop with stroke outline) */}
                    <text
                      x="0"
                      y="16"
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="bold"
                      fill="#ffffff"
                      fontFamily="sans-serif"
                      stroke="#090d16"
                      strokeWidth="3"
                      style={{ paintOrder: 'stroke fill' }}
                    >
                      {bus.name}
                    </text>

                    {/* Voltage Reading Pill */}
                    <text
                      x="0"
                      y="29"
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={busColor}
                      stroke="#090d16"
                      strokeWidth="2.5"
                      style={{ paintOrder: 'stroke fill' }}
                    >
                      {bus.v_pu.toFixed(3)} pu
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Substation Inspector Drawer Panel */}
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
                    Station Name
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
                        selectedBus.v_pu < 0.95
                          ? 'text-rose-600'
                          : selectedBus.v_pu > 1.05
                          ? 'text-amber-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {selectedBus.v_pu.toFixed(3)} pu
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Phase Angle</span>
                    <span className="text-base font-bold text-slate-800">{selectedBus.va_deg.toFixed(2)}°</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Active Power</span>
                    <span className="text-base font-bold text-[#500b50]">{selectedBus.p_mw.toFixed(1)} MW</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Reactive Power</span>
                    <span className="text-base font-bold text-slate-800">{selectedBus.q_mvar.toFixed(1)} MVAR</span>
                  </div>
                </div>

                {/* Connected Lines Interconnects */}
                <div className="pt-2">
                  <span className="text-xs font-bold text-slate-700 block mb-2">
                    Connected Corridors ({connectedLines.length})
                  </span>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {connectedLines.map((line) => {
                      const isTripped = trippedLines.includes(line.id);
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
                              {line.flow_mw.toFixed(1)} MW ({line.loading_percent.toFixed(1)}% load)
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
                Click on any substation busbar in the diagram to inspect voltage profiles, phase angles, and switch
                connected transmission line breakers.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};