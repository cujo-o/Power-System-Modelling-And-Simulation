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
  Layers,
  X,
  Compass,
  Sparkles,
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

// Regional coordinate anchors to cluster geographic neighbors and minimize global crossings
const REGIONAL_ANCHORS: Record<string, Point> = {
  'north-west': { x: 380, y: 240 },
  'north-central': { x: 800, y: 380 },
  'north-east': { x: 1300, y: 260 },
  'south-west': { x: 340, y: 820 },
  'mid-west': { x: 680, y: 780 },
  'south-east': { x: 1040, y: 840 },
  'south-south': { x: 920, y: 980 },
  'main grid': { x: 750, y: 550 },
};

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
  const [scale, setScale] = useState<number>(0.75);
  const [pan, setPan] = useState<Point>({ x: 80, y: 50 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Draggable Bus State
  const [busPositions, setBusPositions] = useState<Record<number, Point>>({});
  const [draggingBusId, setDraggingBusId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // =========================================================================
  // Force-Directed Topological Untangler (STAC-style spring relaxation)
  // =========================================================================
  const computeUntangledPositions = useCallback((): Record<number, Point> => {
    if (!buses || buses.length === 0) return {};

    const positions: Record<number, Point> = {};
    const busIndexMap = new Map<number, number>();

    // 1. Seed positions around regional centers with natural angular spread
    buses.forEach((b, idx) => {
      busIndexMap.set(b.id, idx);
      const zoneKey = (b.zone || '').toLowerCase();
      let anchor = REGIONAL_ANCHORS['main grid'];
      for (const [k, pt] of Object.entries(REGIONAL_ANCHORS)) {
        if (zoneKey.includes(k)) {
          anchor = pt;
          break;
        }
      }

      const angle = (idx * 2.39996) % (2 * Math.PI); // Golden angle distribution
      const radius = 80 + (idx % 7) * 45;
      positions[b.id] = {
        x: Math.round(anchor.x + Math.cos(angle) * radius),
        y: Math.round(anchor.y + Math.sin(angle) * radius),
      };
    });

    // 2. Build adjacency list for edge springs
    const edgeList: { u: number; v: number }[] = [];
    lines.forEach((l) => {
      if (positions[l.from_bus] && positions[l.to_bus]) {
        edgeList.push({ u: l.from_bus, v: l.to_bus });
      }
    });

    // 3. Run iterative force relaxation
    const iterations = 85;
    const idealDist = 240; // Optimal length between connected busbars
    const kRepulsion = 45000;
    let temp = 35.0;

    for (let iter = 0; iter < iterations; iter++) {
      const disp: Record<number, Point> = {};
      buses.forEach((b) => (disp[b.id] = { x: 0, y: 0 }));

      // Coulomb Repulsion between all bus pairs (elliptical to fit wide horizontal busbars)
      for (let i = 0; i < buses.length; i++) {
        const b1 = buses[i];
        for (let j = i + 1; j < buses.length; j++) {
          const b2 = buses[j];
          const p1 = positions[b1.id];
          const p2 = positions[b2.id];
          const dx = p1.x - p2.x;
          const dy = (p1.y - p2.y) * 1.35; // Extra vertical clearance
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq) || 1;

          if (dist < 480) {
            const force = kRepulsion / (distSq + 200);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            disp[b1.id].x += fx;
            disp[b1.id].y += fy;
            disp[b2.id].x -= fx;
            disp[b2.id].y -= fy;
          }
        }
      }

      // Hooke Spring Attraction along transmission corridors
      edgeList.forEach(({ u, v }) => {
        const pU = positions[u];
        const pV = positions[v];
        const dx = pV.x - pU.x;
        const dy = pV.y - pU.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - idealDist) * 0.045;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        disp[u].x += fx;
        disp[u].y += fy;
        disp[v].x -= fx;
        disp[v].y -= fy;
      });

      // Apply displacements with cooling
      buses.forEach((b) => {
        const d = disp[b.id];
        const dLen = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
        const step = Math.min(dLen, temp);
        positions[b.id].x += Math.round((d.x / dLen) * step);
        positions[b.id].y += Math.round((d.y / dLen) * step);
      });

      temp *= 0.95; // Annealing cooling
    }

    return positions;
  }, [buses, lines]);

  // Initial untangle on load
  useEffect(() => {
    if (buses.length > 0) {
      setBusPositions(computeUntangledPositions());
    }
  }, [buses.length, modelName, computeUntangledPositions]);

  // Client to SVG coordinates conversion
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

  // Mouse pan and bus drag handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleBusMouseDown = (e: React.MouseEvent, busId: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const mouseWorld = getSvgCoordinates(e.clientX, e.clientY);
    const busPos = busPositions[busId] || { x: 200, y: 200 };

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
    setScale((prev) => Math.min(3.0, Math.max(0.18, prev * zoomFactor)));
  };

  const handleAutoFit = () => {
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

    const w = maxX - minX + 300;
    const h = maxY - minY + 300;
    const containerW = containerRef.current?.clientWidth || 1200;
    const containerH = containerRef.current?.clientHeight || 800;

    const fitScale = Math.min(containerW / w, containerH / h, 1.1);
    setScale(Math.max(0.25, fitScale));
    setPan({
      x: (containerW - w * fitScale) / 2 - minX * fitScale + 150 * fitScale,
      y: (containerH - h * fitScale) / 2 - minY * fitScale + 150 * fitScale,
    });
  };

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

  // High-Resolution Clear White Vector Exports
  const exportAsPNG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = 2000;
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
    <div className="space-y-3 max-w-7xl mx-auto py-1">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Single-Line Diagram (STAC Clean Vector CAD)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-[#500b50] border border-purple-200">
              Interactive Movable Canvas
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {buses.length} Substation Busbars • {lines.length} Corridors • Drag any busbar to reposition.
          </p>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Substation Fast Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Bus ID or Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#500b50] w-48 font-bold"
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

          {/* Auto-Untangle Spring Relaxation */}
          <button
            onClick={() => setBusPositions(computeUntangledPositions())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-[#500b50] text-xs font-bold transition shadow-2xs"
            title="Automatically untangle and space out all busbars using force relaxation"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Auto-Untangle</span>
          </button>

          {/* Line Style Toggle */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-2xs">
            <button
              onClick={() => setViewStyle('stac_direct')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewStyle === 'stac_direct' ? 'bg-[#500b50] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>STAC Direct</span>
            </button>
            <button
              onClick={() => setViewStyle('orthogonal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewStyle === 'orthogonal' ? 'bg-[#500b50] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Orthogonal</span>
            </button>
          </div>

          {/* Viewport Scale & Fit */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs text-xs font-mono font-bold">
            <button
              onClick={() => setScale((s) => Math.max(0.18, s * 0.85))}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="px-2 text-slate-700">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale((s) => Math.min(3.0, s * 1.15))}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={handleAutoFit}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 ml-0.5 border-l border-slate-200"
              title="Auto-Fit Full Network"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Exports */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs text-xs">
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
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition border-l border-slate-200"
              title="Export Vector SVG"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              <span>SVG</span>
            </button>
            <button
              onClick={exportAsCSV}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded font-bold text-slate-700 transition border-l border-slate-200"
              title="Export CSV Telemetry"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Spacious Canvas Area (840px Height) */}
      <div className="relative w-full">
        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`h-[840px] w-full rounded-2xl border border-slate-300 bg-white relative overflow-hidden shadow-sm select-none ${
            isPanning ? 'cursor-grabbing' : draggingBusId !== null ? 'cursor-move' : 'cursor-grab'
          }`}
        >
          {/* Engineering Banner Watermark */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none opacity-60">
            <Zap className="h-4 w-4 text-[#500b50]" />
            <span className="text-[11px] font-mono tracking-widest text-slate-800 uppercase font-black">
              330kV Bulk Synchronous Grid • STAC Schematic Vector CAD
            </span>
          </div>

          <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-3 text-[10px] font-mono text-slate-400 font-bold">
            <span>Drag any Busbar to Move • Scroll to Zoom • Click Lines to Trip Breaker</span>
          </div>

          {/* Vector SVG Canvas */}
          <svg ref={svgRef} className="w-full h-full" style={{ width: '100%', height: '100%' }}>
            <defs>
              {/* STAC Clear CAD Dot Grid */}
              <pattern id="stacCadGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.85" fill="#cbd5e1" opacity="0.75" />
              </pattern>
              {/* Bold Load Arrow Marker */}
              <marker
                id="loadArrow"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#000000" />
              </marker>
            </defs>

            {/* Clear Background Surface */}
            <rect x="-12000" y="-12000" width="36000" height="36000" fill="url(#stacCadGrid)" pointerEvents="none" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* ========================================================================= */}
              {/* 1. TRANSMISSION LINES WITH STAC INLINE RECTANGULAR BREAKER BOXES           */}
              {/* ========================================================================= */}
              {lines.map((line) => {
                const posA = busPositions[line.from_bus];
                const posB = busPositions[line.to_bus];
                if (!posA || !posB) return null;

                const isTripped = trippedLines.includes(line.id);
                const loadingPercent = line.loading_percent ?? 0;
                const isOverload = loadingPercent > 100;
                const lineColor = isTripped ? '#dc2626' : isOverload ? '#ea580c' : '#000000';
                const flow = line.flow_mw ?? line.p_mw ?? 0;

                let pathData = '';
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                if (viewStyle === 'orthogonal') {
                  pathData = `M ${posA.x} ${posA.y} L ${posA.x} ${midY} L ${posB.x} ${midY} L ${posB.x} ${posB.y}`;
                } else {
                  // Clean STAC direct route
                  pathData = `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;
                }

                return (
                  <g
                    key={`line-${line.id}`}
                    className="cursor-pointer group"
                    onClick={() => toggleLine(line.id)}
                  >
                    {/* Hover Buffer */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="22" />

                    {/* Bold Transmission Line Path */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={isTripped ? 2.5 : 3.5}
                      strokeDasharray={isTripped ? '8 6' : undefined}
                      strokeOpacity={isTripped ? 0.35 : 0.95}
                      className="transition-all duration-150 group-hover:stroke-[#500b50] group-hover:stroke-width-4"
                    />

                    {/* STAC Inline Rectangular Branch / Breaker Indicator */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x="-26"
                        y="-10"
                        width="52"
                        height="20"
                        rx="3"
                        fill="#ffffff"
                        stroke={lineColor}
                        strokeWidth="2"
                        className="transition group-hover:fill-purple-50"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontSize="9.5"
                        fontFamily="monospace"
                        fontWeight="900"
                        fill={isTripped ? '#dc2626' : isOverload ? '#c2410c' : '#000000'}
                      >
                        {isTripped ? 'OPEN' : `${Math.abs(flow).toFixed(0)}M`}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* ========================================================================= */}
              {/* 2. RECTANGULAR BUSBARS (MOVABLE, BOLD, WITH STAC GENERATOR & LOAD SYMBOLS) */}
              {/* ========================================================================= */}
              {buses.map((bus) => {
                const pos = busPositions[bus.id];
                if (!pos) return null;

                const isSelected = selectedBus?.id === bus.id;
                const isDragging = draggingBusId === bus.id;
                const vVal = bus.v_pu ?? 1.0;
                const isUnder = vVal < 0.95;
                const isOver = vVal > 1.05;
                const busBarColor = isUnder ? '#dc2626' : isOver ? '#d97706' : '#000000';

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
                    {/* Selection Indicator Beacon */}
                    {isSelected && (
                      <rect
                        x="-58"
                        y="-26"
                        width="116"
                        height="52"
                        rx="8"
                        fill="#500b50"
                        fillOpacity="0.12"
                        stroke="#500b50"
                        strokeWidth="2.5"
                        strokeDasharray="5 3"
                      />
                    )}

                    {/* STAC Generator Infeed: Circle with Bold Sine Wave (~ ) */}
                    {isGen && (
                      <g transform="translate(0, -36)">
                        <line x1="0" y1="14" x2="0" y2="36" stroke="#000000" strokeWidth="2.5" />
                        <circle cx="0" cy="0" r="14" fill="#ffffff" stroke="#000000" strokeWidth="2.5" />
                        <path
                          d="M -6 0 Q -3 -5.5 0 0 T 6 0"
                          fill="none"
                          stroke="#000000"
                          strokeWidth="2.5"
                        />
                        <text
                          x="0"
                          y="-18"
                          textAnchor="middle"
                          fontSize="10"
                          fill="#000000"
                          fontFamily="monospace"
                          fontWeight="900"
                        >
                          {Math.abs(bus.p_mw ?? 0).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* STAC Load Drop: Bold Downward Arrow Line Connected to Busbar */}
                    {hasLoad && !isGen && (
                      <g transform="translate(0, 8)">
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="26"
                          stroke="#000000"
                          strokeWidth="2.5"
                          markerEnd="url(#loadArrow)"
                        />
                        <text
                          x="0"
                          y="40"
                          textAnchor="middle"
                          fontSize="9.5"
                          fontFamily="monospace"
                          fontWeight="900"
                          fill="#1e293b"
                        >
                          {(bus.p_mw ?? 0).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* Bold Rectangular Copper Busbar (NOT A CIRCLE) */}
                    <rect
                      x="-48"
                      y="-6"
                      width="96"
                      height="12"
                      rx="2.5"
                      fill={busBarColor}
                      stroke="#000000"
                      strokeWidth="1.5"
                      className={`transition-shadow ${
                        isDragging ? 'filter drop-shadow-lg' : 'group-hover:filter drop-shadow-md'
                      }`}
                    />

                    {/* Bold Substation Identifier */}
                    <text
                      x="0"
                      y="-12"
                      textAnchor="middle"
                      fontSize="11.5"
                      fontFamily="sans-serif"
                      fontWeight="900"
                      fill="#000000"
                      letterSpacing="0.3px"
                    >
                      {bus.name}
                    </text>

                    {/* Bold Voltage Magnitude Reading */}
                    <text
                      x="0"
                      y={hasLoad && !isGen ? '52' : '22'}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="900"
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
          {/* 3. STAC-STYLE FLOATING PROPERTY INSPECTOR (Exact STAC Table)              */}
          {/* ========================================================================= */}
          {selectedBus && (
            <div className="absolute top-4 right-4 z-20 w-80 rounded-2xl border border-slate-300 bg-white/95 backdrop-blur-md shadow-2xl p-4 text-xs font-sans animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#500b50]" />
                  <span className="font-black text-slate-900 text-sm">
                    Bus {selectedBus.id} ({selectedBus.name})
                  </span>
                </div>
                <button
                  onClick={() => setSelectedBus(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Exact STAC Technical Data Table */}
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-1 px-2.5">Property</th>
                      <th className="py-1 px-2.5">Value</th>
                      <th className="py-1 px-2.5">Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    <tr className="bg-slate-50/70 font-bold text-slate-500 text-[10px]">
                      <td colSpan={3} className="py-1 px-2.5 uppercase tracking-wider">
                        Static Topology
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Id</td>
                      <td className="py-1 px-2.5 font-mono font-bold">{selectedBus.id}</td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Zone</td>
                      <td className="py-1 px-2.5 font-semibold">{selectedBus.zone || 'Bulk Grid'}</td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Base KV</td>
                      <td className="py-1 px-2.5 font-mono font-bold">{selectedBus.vn_kv || 330.0}</td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">kV</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">V Max</td>
                      <td className="py-1 px-2.5 font-mono font-bold text-amber-700">1.05000</td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Volts p.u.</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">V Min</td>
                      <td className="py-1 px-2.5 font-mono font-bold text-rose-700">0.95000</td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Volts p.u.</td>
                    </tr>

                    <tr className="bg-slate-50/70 font-bold text-slate-500 text-[10px]">
                      <td colSpan={3} className="py-1 px-2.5 uppercase tracking-wider">
                        Power Flow Result
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Voltage</td>
                      <td className="py-1 px-2.5 font-mono font-black text-[#500b50]">
                        {(selectedBus.v_pu ?? 1.0).toFixed(5)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Volts p.u.</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Phase Angle</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(selectedBus.va_deg ?? 0.0).toFixed(5)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">Degrees</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Active Power</td>
                      <td className="py-1 px-2.5 font-mono font-black">
                        {(selectedBus.p_mw ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MW</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Reactive Power</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(selectedBus.q_mvar ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MVAR</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Connected Corridors with Inline Breakers */}
              <div className="mt-3">
                <span className="text-[10px] uppercase font-black text-slate-500 block tracking-wider mb-1.5">
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
                            <span className="font-mono text-slate-500 text-[9px] font-semibold">
                              {(l.flow_mw ?? l.p_mw ?? 0).toFixed(1)} MW • {(l.loading_percent ?? 0).toFixed(0)}% load
                            </span>
                          </div>
                          <button
                            onClick={() => toggleLine(l.id)}
                            className={`px-2 py-0.5 rounded font-black transition shrink-0 ${
                              isTripped
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-rose-600 text-white hover:bg-rose-700'
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