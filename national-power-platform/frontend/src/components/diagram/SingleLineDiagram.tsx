'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { BusData, LineData } from '@/types/grid';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Download,
  Image as ImageIcon,
  FileSpreadsheet,
  Search,
  Zap,
  Power,
  Layers,
  X,
  Compass,
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

interface Point {
  x: number;
  y: number;
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
  const [viewStyle, setViewStyle] = useState<'stac_direct' | 'orthogonal'>('stac_direct');
  const [searchQuery, setSearchQuery] = useState('');

  // Viewport Pan & Zoom
  const [scale, setScale] = useState<number>(0.9);
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Draggable Bus State
  const [busPositions, setBusPositions] = useState<Record<number, Point>>({});
  const [draggingBusId, setDraggingBusId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // 1. Initial Algorithmic Placement (Tiered Hierarchy)
  const initialPositions = useMemo(() => {
    const coords: Record<number, Point> = {};
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
        (b.name || '').toLowerCase().includes('hydro');

      if (isGen) genBuses.push(b);
      else if ((b.vn_kv && b.vn_kv >= 330) || (b.p_mw ?? 0) > 80) bulkBuses.push(b);
      else subBuses.push(b);
    });

    const xPitch = 240;
    const yGen = 140;
    const yBulk = 380;
    const ySub = 640;

    // Generators
    genBuses.forEach((b, i) => {
      coords[b.id] = { x: 120 + i * xPitch, y: yGen };
    });

    // 330kV Bulk Backbone
    bulkBuses.forEach((b, i) => {
      const row = Math.floor(i / 8);
      const col = i % 8;
      coords[b.id] = { x: 120 + col * xPitch, y: yBulk + row * 180 };
    });

    // Sub-transmission & Infeed
    subBuses.forEach((b, i) => {
      const row = Math.floor(i / 7);
      const col = i % 7;
      coords[b.id] = { x: 160 + col * (xPitch * 1.05), y: ySub + row * 180 };
    });

    return coords;
  }, [buses]);

  // Sync initial layout when model loads
  useEffect(() => {
    setBusPositions(initialPositions);
  }, [initialPositions]);

  // Convert Client Window Coordinates to SVG World Coordinates
  const getSvgCoordinates = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / scale,
        y: (clientY - rect.top - pan.y) / scale,
      };
    },
    [pan, scale]
  );

  // =========================================================================
  // Canvas Mouse & Drag Listeners
  // =========================================================================
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleBusMouseDown = (e: React.MouseEvent, busId: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const mouseWorld = getSvgCoordinates(e.clientX, e.clientY);
    const busPos = busPositions[busId] || initialPositions[busId] || { x: 100, y: 100 };

    setDraggingBusId(busId);
    setHasDragged(false);
    setDragOffset({
      x: mouseWorld.x - busPos.x,
      y: mouseWorld.y - busPos.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingBusId !== null) {
      setHasDragged(true);
      const mouseWorld = getSvgCoordinates(e.clientX, e.clientY);
      setBusPositions((prev) => ({
        ...prev,
        [draggingBusId]: {
          x: Math.round(mouseWorld.x - dragOffset.x),
          y: Math.round(mouseWorld.y - dragOffset.y),
        },
      }));
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingBusId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    setScale((prev) => Math.min(3.5, Math.max(0.2, prev * zoomFactor)));
  };

  const handleResetLayout = () => {
    setBusPositions(initialPositions);
    setScale(0.9);
    setPan({ x: 80, y: 60 });
  };

  const handleAutoFit = () => {
    if (buses.length === 0) return;
    const positions = Object.values(busPositions);
    if (positions.length === 0) return;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    positions.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const width = maxX - minX + 240;
    const height = maxY - minY + 240;
    const containerWidth = containerRef.current?.clientWidth || 1000;
    const containerHeight = containerRef.current?.clientHeight || 700;

    const fitScale = Math.min(containerWidth / width, containerHeight / height, 1.2);
    setScale(Math.max(0.3, fitScale * 0.95));
    setPan({
      x: (containerWidth - width * fitScale) / 2 - minX * fitScale + 80,
      y: (containerHeight - height * fitScale) / 2 - minY * fitScale + 80,
    });
  };

  // Search filter focus
  const handleSearchSelect = (busId: number) => {
    const pos = busPositions[busId];
    if (pos && containerRef.current) {
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      setPan({
        x: containerW / 2 - pos.x * scale,
        y: containerH / 2 - pos.y * scale,
      });
      const b = buses.find((item) => item.id === busId);
      if (b) setSelectedBus(b);
    }
  };

  // =========================================================================
  // Exports (PNG, SVG, CSV)
  // =========================================================================
  const exportAsPNG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 2800;
    canvas.height = 1800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `NESI_STAC_SLD_${modelName || 'Grid'}.png`;
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
    a.download = `NESI_STAC_SLD_${modelName || 'Grid'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = () => {
    let csv = 'ELEMENT,ID,NAME,FROM_BUS,TO_BUS,FLOW_MW,LOADING_PERCENT,VOLTAGE_PU,ANGLE_DEG,STATUS\n';
    buses.forEach((b) => {
      csv += `BUS,#${b.id},"${b.name}",-,-,${b.p_mw ?? 0},-,${(b.v_pu ?? 1.0).toFixed(3)},${(
        b.va_deg ?? 0.0
      ).toFixed(2)},OPERATIONAL\n`;
    });
    lines.forEach((l) => {
      const isTripped = trippedLines.includes(l.id);
      const flow = l.flow_mw ?? l.p_mw ?? 0;
      const load = l.loading_percent ?? 0;
      csv += `LINE,#${l.id},"${l.name}",#${l.from_bus},#${l.to_bus},${isTripped ? 0 : flow.toFixed(1)},${
        isTripped ? 0 : load.toFixed(1)
      }%,-,-,${isTripped ? 'TRIPPED' : 'IN_SERVICE'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESI_Topology_${modelName || 'Grid'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Single-Line Schematic (STAC Vector CAD)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-[#500b50] border border-purple-200">
              Interactive Movable Canvas
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {buses.length} Substation Busbars • {lines.length} Transmission Corridors • Drag any busbar to reposition.
          </p>
        </div>

        {/* Action Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Bus ID or Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#500b50] w-48 font-medium"
            />
            {searchQuery && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                {buses
                  .filter(
                    (b) =>
                      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      String(b.id).includes(searchQuery)
                  )
                  .map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        handleSearchSelect(b.id);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="font-bold text-slate-800 truncate">{b.name}</span>
                      <span className="font-mono text-slate-400 text-[10px]">#{b.id}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Line Style Switcher */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-xs">
            <button
              onClick={() => setViewStyle('stac_direct')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewStyle === 'stac_direct' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>STAC Direct</span>
            </button>
            <button
              onClick={() => setViewStyle('orthogonal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewStyle === 'orthogonal' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Orthogonal</span>
            </button>
          </div>

          {/* Viewport Zoom & Fit Controls */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs text-xs font-mono">
            <button
              onClick={() => setScale((s) => Math.max(0.2, s * 0.85))}
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
              onClick={handleAutoFit}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 ml-1 border-l border-slate-100"
              title="Auto Fit to Screen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleResetLayout}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 ml-1 border-l border-slate-100"
              title="Reset All Busbar Coordinates"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Export Controls */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs text-xs">
            <button
              onClick={exportAsPNG}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition"
              title="Export high-resolution PNG"
            >
              <ImageIcon className="h-3.5 w-3.5 text-cyan-600" />
              <span>PNG</span>
            </button>
            <button
              onClick={exportAsSVG}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition border-l border-slate-100"
              title="Export Vector SVG"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              <span>SVG</span>
            </button>
            <button
              onClick={exportAsCSV}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition border-l border-slate-100"
              title="Export CSV Telemetry"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Drawing Surface */}
      <div className="relative w-full">
        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`h-[780px] w-full rounded-2xl border border-slate-300 bg-white relative overflow-hidden shadow-sm select-none ${
            isPanning ? 'cursor-grabbing' : draggingBusId !== null ? 'cursor-move' : 'cursor-grab'
          }`}
        >
          {/* Engineering CAD Header Tag */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none opacity-60">
            <Zap className="h-4 w-4 text-[#500b50]" />
            <span className="text-[11px] font-mono tracking-widest text-slate-700 uppercase font-bold">
              330kV Bulk Synchronous Grid • STAC Schematic Vector CAD
            </span>
          </div>

          <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-3 text-[10px] font-mono text-slate-400">
            <span>Click & Drag any Busbar to Move • Scroll to Zoom • Click Lines to Trip</span>
          </div>

          {/* Vector SVG Canvas */}
          <svg ref={svgRef} className="w-full h-full" style={{ width: '100%', height: '100%' }}>
            <defs>
              {/* STAC Engineering Dot Grid */}
              <pattern id="stacCadGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.75" fill="#cbd5e1" opacity="0.6" />
              </pattern>
              {/* Load Arrow Marker */}
              <marker
                id="loadArrow"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a" />
              </marker>
            </defs>

            {/* Clear CAD Background Grid */}
            <rect x="-8000" y="-8000" width="24000" height="24000" fill="url(#stacCadGrid)" pointerEvents="none" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* ========================================================================= */}
              {/* 1. TRANSMISSION LINES WITH STAC INLINE RECTANGULAR BRANCH BOXES           */}
              {/* ========================================================================= */}
              {lines.map((line) => {
                const posA = busPositions[line.from_bus] || initialPositions[line.from_bus];
                const posB = busPositions[line.to_bus] || initialPositions[line.to_bus];
                if (!posA || !posB) return null;

                const isTripped = trippedLines.includes(line.id);
                const loadingPercent = line.loading_percent ?? 0;
                const isOverload = loadingPercent > 100;
                const lineColor = isTripped ? '#dc2626' : isOverload ? '#ea580c' : '#0f172a';
                const flow = line.flow_mw ?? line.p_mw ?? 0;

                let pathData = '';
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                if (viewStyle === 'orthogonal') {
                  pathData = `M ${posA.x} ${posA.y} L ${posA.x} ${midY} L ${posB.x} ${midY} L ${posB.x} ${posB.y}`;
                } else {
                  // STAC Direct Clean CAD Trace
                  pathData = `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;
                }

                return (
                  <g
                    key={`line-${line.id}`}
                    className="cursor-pointer group"
                    onClick={() => toggleLine(line.id)}
                  >
                    {/* Hover Buffer */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="18" />

                    {/* Main Line Trace */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={isTripped ? 2 : 2.5}
                      strokeDasharray={isTripped ? '6 5' : undefined}
                      strokeOpacity={isTripped ? 0.4 : 0.9}
                      className="transition-all duration-150 group-hover:stroke-[#500b50] group-hover:stroke-width-3"
                    />

                    {/* STAC Inline Rectangular Branch / Breaker Indicator */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x="-24"
                        y="-8.5"
                        width="48"
                        height="17"
                        rx="2"
                        fill="#ffffff"
                        stroke={lineColor}
                        strokeWidth={isTripped ? 1.5 : 2}
                        className="transition group-hover:fill-purple-50"
                      />
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        fontSize="8.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                        fill={isTripped ? '#dc2626' : isOverload ? '#c2410c' : '#0f172a'}
                      >
                        {isTripped ? 'OPEN' : `${Math.abs(flow).toFixed(0)}M`}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* ========================================================================= */}
              {/* 2. SUBSTATION BUSBARS (MOVABLE, RECTANGULAR, STAC GENERATORS & LOADS)     */}
              {/* ========================================================================= */}
              {buses.map((bus) => {
                const pos = busPositions[bus.id] || initialPositions[bus.id];
                if (!pos) return null;

                const isSelected = selectedBus?.id === bus.id;
                const isDragging = draggingBusId === bus.id;
                const vVal = bus.v_pu ?? 1.0;
                const isUnder = vVal < 0.95;
                const isOver = vVal > 1.05;
                const busBarColor = isUnder ? '#dc2626' : isOver ? '#d97706' : '#0f172a';

                const isGen =
                  (bus.p_mw ?? 0) < -20 ||
                  (bus.name || '').toLowerCase().includes('gs') ||
                  (bus.name || '').toLowerCase().includes('ps') ||
                  (bus.name || '').toLowerCase().includes('slack');

                const hasLoad = (bus.p_mw ?? 0) > 10;

                return (
                  <g
                    key={`bus-${bus.id}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onMouseDown={(e) => handleBusMouseDown(e, bus.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!hasDragged) {
                        setSelectedBus(bus);
                      }
                    }}
                    className="cursor-move group"
                  >
                    {/* Selection Beacon */}
                    {isSelected && (
                      <rect
                        x="-52"
                        y="-22"
                        width="104"
                        height="44"
                        rx="6"
                        fill="#500b50"
                        fillOpacity="0.1"
                        stroke="#500b50"
                        strokeWidth="1.8"
                        strokeDasharray="4 2"
                      />
                    )}

                    {/* STAC Generator Symbol: Circle with ~ Sine Wave on Top of Busbar */}
                    {isGen && (
                      <g transform="translate(0, -32)">
                        <line x1="0" y1="12" x2="0" y2="32" stroke="#0f172a" strokeWidth="2" />
                        <circle cx="0" cy="0" r="12" fill="#ffffff" stroke="#0f172a" strokeWidth="2" />
                        <path
                          d="M -5 0 Q -2.5 -4.5 0 0 T 5 0"
                          fill="none"
                          stroke="#0f172a"
                          strokeWidth="1.8"
                        />
                        <text
                          x="0"
                          y="-16"
                          textAnchor="middle"
                          fontSize="9"
                          fill="#0f172a"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {Math.abs(bus.p_mw ?? 0).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* STAC Load Symbol: Downward Arrow Connected to Bottom of Busbar */}
                    {hasLoad && !isGen && (
                      <g transform="translate(0, 8)">
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="24"
                          stroke="#0f172a"
                          strokeWidth="2"
                          markerEnd="url(#loadArrow)"
                        />
                        <text
                          x="0"
                          y="36"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                          fill="#475569"
                        >
                          {(bus.p_mw ?? 0).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* The Heavy Rectangular Copper Busbar (NOT A CIRCLE) */}
                    <rect
                      x="-42"
                      y="-4.5"
                      width="84"
                      height="9"
                      rx="2"
                      fill={busBarColor}
                      stroke="#ffffff"
                      strokeWidth="1.2"
                      className={`transition-shadow ${
                        isDragging ? 'filter drop-shadow-md' : 'group-hover:filter drop-shadow-sm'
                      }`}
                    />

                    {/* Substation Label */}
                    <text
                      x="0"
                      y="-10"
                      textAnchor="middle"
                      fontSize="9.5"
                      fontFamily="sans-serif"
                      fontWeight="bold"
                      fill="#0f172a"
                    >
                      {bus.name}
                    </text>

                    {/* Voltage Reading */}
                    <text
                      x="0"
                      y={hasLoad && !isGen ? '48' : '18'}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={isUnder ? '#dc2626' : isOver ? '#d97706' : '#15803d'}
                    >
                      {vVal.toFixed(3)} pu
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* ========================================================================= */}
          {/* 3. STAC-STYLE FLOATING TECHNICAL PROPERTY INSPECTOR (Exact Table)          */}
          {/* ========================================================================= */}
          {selectedBus && (
            <div className="absolute top-4 right-4 z-20 w-80 rounded-xl border border-slate-300 bg-white/95 backdrop-blur-md shadow-2xl p-4 text-xs font-sans animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#500b50]" />
                  <span className="font-bold text-slate-900 text-sm">
                    Bus {selectedBus.id} ({selectedBus.name})
                  </span>
                </div>
                <button
                  onClick={() => setSelectedBus(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Exact STAC Technical Data Table */}
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-1 px-2.5">Property</th>
                      <th className="py-1 px-2.5">Value</th>
                      <th className="py-1 px-2.5">Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    <tr className="bg-slate-50/50 font-bold text-slate-500 text-[10px]">
                      <td colSpan={3} className="py-1 px-2.5">
                        Static Topology
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">Id</td>
                      <td className="py-1 px-2.5 font-mono">{selectedBus.id}</td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">Zone</td>
                      <td className="py-1 px-2.5">{selectedBus.zone || 'Bulk Grid'}</td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">Base KV</td>
                      <td className="py-1 px-2.5 font-mono">{selectedBus.vn_kv || 330.0}</td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">kV</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">V Max</td>
                      <td className="py-1 px-2.5 font-mono text-amber-700">1.05000</td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Volts p.u.</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">V Min</td>
                      <td className="py-1 px-2.5 font-mono text-rose-700">0.95000</td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Volts p.u.</td>
                    </tr>

                    <tr className="bg-slate-50/50 font-bold text-slate-500 text-[10px]">
                      <td colSpan={3} className="py-1 px-2.5">
                        Power Flow Result
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">Voltage</td>
                      <td className="py-1 px-2.5 font-mono font-bold text-[#500b50]">
                        {(selectedBus.v_pu ?? 1.0).toFixed(5)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Volts p.u.</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">Phase Angle</td>
                      <td className="py-1 px-2.5 font-mono">
                        {(selectedBus.va_deg ?? 0.0).toFixed(5)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Degrees</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">Active Power</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(selectedBus.p_mw ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MW</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-medium">Reactive Power</td>
                      <td className="py-1 px-2.5 font-mono">
                        {(selectedBus.q_mvar ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MVAR</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Connected Corridors with Inline Breaker Toggles */}
              <div className="mt-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1.5">
                  Connected Branch Corridors
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {lines
                    .filter((l) => l.from_bus === selectedBus.id || l.to_bus === selectedBus.id)
                    .map((l) => {
                      const isTripped = trippedLines.includes(l.id);
                      return (
                        <div
                          key={l.id}
                          className="flex items-center justify-between p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[10px]"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-slate-900 block truncate">{l.name}</span>
                            <span className="font-mono text-slate-400 text-[9px]">
                              {(l.flow_mw ?? l.p_mw ?? 0).toFixed(1)} MW • {(l.loading_percent ?? 0).toFixed(0)}% load
                            </span>
                          </div>
                          <button
                            onClick={() => toggleLine(l.id)}
                            className={`px-2 py-0.5 rounded font-bold transition shrink-0 ${
                              isTripped
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {isTripped ? 'Reclose' : 'Trip Breaker'}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};