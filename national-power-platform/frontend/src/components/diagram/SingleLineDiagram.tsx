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

  // Canvas Viewport Pan & Zoom
  const [scale, setScale] = useState<number>(0.55);
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Persistent Draggable Busbar Coordinates
  const [busPositions, setBusPositions] = useState<Record<number, Point>>({});
  const busPositionsRef = useRef<Record<number, Point>>({});
  busPositionsRef.current = busPositions;

  const [draggingBusId, setDraggingBusId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const currentModelRef = useRef<string>('');

  // =========================================================================
  // Automatic STAC Topological Untangler (Kamada-Kawai + AABB Non-Overlap)
  // =========================================================================
  const computeAutomaticUntangledLayout = useCallback((): Record<number, Point> => {
    const N = buses.length;
    if (N === 0) return {};

    // 1. Build Adjacency Graph from lines
    const adj: Record<number, number[]> = {};
    buses.forEach((b) => {
      adj[b.id] = [];
    });
    lines.forEach((l) => {
      if (adj[l.from_bus]) adj[l.from_bus].push(l.to_bus);
      if (adj[l.to_bus]) adj[l.to_bus].push(l.from_bus);
    });

    // 2. All-Pairs Shortest Path Matrix D[i][j] via BFS
    const idToIndex = new Map<number, number>();
    buses.forEach((b, i) => idToIndex.set(b.id, i));

    const D: number[][] = Array.from({ length: N }, () => Array(N).fill(999));
    for (let i = 0; i < N; i++) {
      D[i][i] = 0;
      const queue: number[] = [buses[i].id];
      while (queue.length > 0) {
        const currId = queue.shift()!;
        const currIdx = idToIndex.get(currId)!;
        const d = D[i][currIdx];
        const neighbors = adj[currId] || [];
        for (const nbrId of neighbors) {
          const nbrIdx = idToIndex.get(nbrId);
          if (nbrIdx !== undefined && D[i][nbrIdx] > d + 1) {
            D[i][nbrIdx] = d + 1;
            queue.push(nbrId);
          }
        }
      }
    }

    // Connect any disjoint islands gracefully
    let maxD = 1;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (D[i][j] < 900 && D[i][j] > maxD) maxD = D[i][j];
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (D[i][j] >= 900) D[i][j] = maxD * 1.6;
      }
    }

    // 3. Kamada-Kawai Stress Matrix
    const idealEdgeLen = N > 30 ? 250 : 210;
    const L: number[][] = Array.from({ length: N }, (_, i) =>
      Array.from({ length: N }, (_, j) => idealEdgeLen * D[i][j])
    );
    const K: number[][] = Array.from({ length: N }, (_, i) =>
      Array.from({ length: N }, (_, j) => (i === j ? 0 : 1.0 / (D[i][j] * D[i][j] + 0.05)))
    );

    // Initial seed placement in circle
    const cx = 1600;
    const cy = 1200;
    const initialRadius = Math.max(380, N * 28);
    const posArr: Point[] = buses.map((_, i) => {
      const theta = (i / N) * 2 * Math.PI;
      return {
        x: cx + Math.cos(theta) * initialRadius,
        y: cy + Math.sin(theta) * initialRadius,
      };
    });

    // Run Gradient Descent Stress Minimization
    let lr = 0.18;
    const iterations = N > 30 ? 110 : 80;
    for (let iter = 0; iter < iterations; iter++) {
      const grad: Point[] = Array.from({ length: N }, () => ({ x: 0, y: 0 }));

      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          const dx = posArr[i].x - posArr[j].x;
          const dy = posArr[i].y - posArr[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const factor = (2.0 * K[i][j] * (dist - L[i][j])) / dist;
          grad[i].x += dx * factor;
          grad[i].y += dy * factor;
        }
      }

      for (let i = 0; i < N; i++) {
        posArr[i].x -= lr * grad[i].x;
        posArr[i].y -= lr * grad[i].y;
      }
      lr *= 0.975;
    }

    // 4. Overlap Elimination (AABB Bounding Box Separation Pass)
    const MIN_DX = 240; // 100px busbar width + clear margin
    const MIN_DY = 150; // Bus height + generator and load lead clearances

    for (let pass = 0; pass < 35; pass++) {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = posArr[j].x - posArr[i].x;
          const dy = posArr[j].y - posArr[i].y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          if (absDx < MIN_DX && absDy < MIN_DY) {
            const overlapX = MIN_DX - absDx;
            const overlapY = MIN_DY - absDy;

            if (overlapX < overlapY) {
              const shiftX = overlapX / 2 + 5;
              const sign = dx >= 0 ? 1 : -1;
              posArr[j].x += sign * shiftX;
              posArr[i].x -= sign * shiftX;
            } else {
              const shiftY = overlapY / 2 + 5;
              const sign = dy >= 0 ? 1 : -1;
              posArr[j].y += sign * shiftY;
              posArr[i].y -= sign * shiftY;
            }
          }
        }
      }
    }

    // Map back to bus.id
    const positions: Record<number, Point> = {};
    buses.forEach((b, i) => {
      positions[b.id] = {
        x: Math.round(posArr[i].x),
        y: Math.round(posArr[i].y),
      };
    });

    return positions;
  }, [buses, lines]);

  const handleAutoFit = useCallback(() => {
    const positions = Object.values(busPositionsRef.current);
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

    const w = maxX - minX + 350;
    const h = maxY - minY + 350;
    const containerW = containerRef.current?.clientWidth || 1200;
    const containerH = containerRef.current?.clientHeight || 880;

    const fitScale = Math.min(containerW / w, containerH / h, 1.0);
    setScale(Math.max(0.18, fitScale));
    setPan({
      x: (containerW - w * fitScale) / 2 - minX * fitScale + 175 * fitScale,
      y: (containerH - h * fitScale) / 2 - minY * fitScale + 175 * fitScale,
    });
  }, []);

  // =========================================================================
  // Automatic Untangling on Load & Persistent Coordinates across Line-Trips
  // =========================================================================
  useEffect(() => {
    if (!buses || buses.length === 0) return;

    const isNewModel = currentModelRef.current !== modelName;
    currentModelRef.current = modelName;
    const storageKey = `nesi_sld_pos_${modelName || 'default'}`;

    // 1. If coordinates already exist in memory for this model, preserve them completely
    if (!isNewModel && Object.keys(busPositionsRef.current).length >= buses.length) {
      return;
    }

    // 2. Check localStorage
    if (typeof window !== 'undefined' && !isNewModel) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (buses.every((b) => parsed[b.id] !== undefined)) {
            setBusPositions(parsed);
            busPositionsRef.current = parsed;
            return;
          }
        } catch (_) {}
      }
    }

    // 3. Automatically untangle by default on model load
    const autoUntangled = computeAutomaticUntangledLayout();
    setBusPositions(autoUntangled);
    busPositionsRef.current = autoUntangled;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(autoUntangled));
      } catch (_) {}
    }

    const timer = setTimeout(handleAutoFit, 80);
    return () => clearTimeout(timer);
  }, [modelName, buses.length, computeAutomaticUntangledLayout, handleAutoFit]);

  // Convert Client Window Coordinates to SVG Canvas Coordinates
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

  // Mouse pan and bus drag events
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
      const newPos = {
        x: Math.round(mouseWorld.x - dragOffset.x),
        y: Math.round(mouseWorld.y - dragOffset.y),
      };

      setBusPositions((prev) => {
        const next = { ...prev, [draggingBusId]: newPos };
        busPositionsRef.current = next;
        return next;
      });
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (draggingBusId !== null) {
      setDraggingBusId(null);
      if (typeof window !== 'undefined' && modelName) {
        try {
          localStorage.setItem(`nesi_sld_pos_${modelName}`, JSON.stringify(busPositionsRef.current));
        } catch (_) {}
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    setScale((prev) => Math.min(3.0, Math.max(0.12, prev * zoomFactor)));
  };

  const handleResetLayout = () => {
    if (typeof window !== 'undefined' && modelName) {
      localStorage.removeItem(`nesi_sld_pos_${modelName}`);
    }
    const fresh = computeAutomaticUntangledLayout();
    setBusPositions(fresh);
    busPositionsRef.current = fresh;
    if (typeof window !== 'undefined' && modelName) {
      try {
        localStorage.setItem(`nesi_sld_pos_${modelName}`, JSON.stringify(fresh));
      } catch (_) {}
    }
    setTimeout(handleAutoFit, 60);
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
    canvas.width = 3600;
    canvas.height = 2400;
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
              Single-Line Schematic (STAC Vector CAD)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-[#500b50] border border-purple-200">
              Interactive Movable Canvas
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            {buses.length} Substations • {lines.length} Corridors • Drag any busbar to adjust; positions are preserved.
          </p>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Substation Fast Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Substation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#500b50] w-44 font-bold text-slate-800"
            />
            {searchQuery && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto divide-y divide-slate-100">
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
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between font-bold"
                    >
                      <span className="text-slate-900 truncate">{b.name}</span>
                      <span className="font-mono text-slate-400 text-[10px]">#{b.id}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Reset Clean Layout */}
          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
            title="Recalculate untangled topological layout"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Layout</span>
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

          {/* Viewport Zoom & Fit */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs text-xs font-mono font-bold">
            <button
              onClick={() => setScale((s) => Math.max(0.12, s * 0.85))}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="px-2 text-slate-800">{Math.round(scale * 100)}%</span>
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
              title="Auto-Fit Network"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Exports */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs text-xs font-bold">
            <button
              onClick={exportAsPNG}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded text-slate-700 transition"
              title="Export high-resolution PNG"
            >
              <ImageIcon className="h-3.5 w-3.5 text-cyan-600" />
              <span>PNG</span>
            </button>
            <button
              onClick={exportAsSVG}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded text-slate-700 transition border-l border-slate-200"
              title="Export Vector SVG"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              <span>SVG</span>
            </button>
            <button
              onClick={exportAsCSV}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded text-slate-700 transition border-l border-slate-200"
              title="Export CSV Telemetry"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Full-Bleed CAD Canvas (880px Height) */}
      <div className="relative w-full">
        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`h-[880px] w-full rounded-2xl border border-slate-300 bg-white relative overflow-hidden shadow-sm select-none ${
            isPanning ? 'cursor-grabbing' : draggingBusId !== null ? 'cursor-move' : 'cursor-grab'
          }`}
        >
          {/* Engineering CAD Header Tag */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none opacity-60">
            <Zap className="h-4 w-4 text-[#500b50]" />
            <span className="text-[11px] font-mono tracking-widest text-slate-900 uppercase font-black">
              330kV Bulk Synchronous Grid • STAC Vector CAD
            </span>
          </div>

          <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-3 text-[10px] font-mono text-slate-400 font-bold">
            <span>Drag any Substation to Move • Scroll to Zoom • Positions Persist on Breaker Trips</span>
          </div>

          {/* Vector SVG Canvas */}
          <svg ref={svgRef} className="w-full h-full" style={{ width: '100%', height: '100%' }}>
            <defs>
              {/* STAC Engineering Dot Grid */}
              <pattern id="stacCadGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.85" fill="#cbd5e1" opacity="0.8" />
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

            {/* Clear CAD Background Grid */}
            <rect x="-16000" y="-16000" width="48000" height="48000" fill="url(#stacCadGrid)" pointerEvents="none" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* ========================================================================= */}
              {/* 1. TRANSMISSION LINES WITH DYNAMIC BREAKER BOXES                           */}
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

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const lineDist = Math.sqrt(dx * dx + dy * dy);
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                let pathData = '';
                if (viewStyle === 'orthogonal') {
                  pathData = `M ${posA.x} ${posA.y} L ${posA.x} ${midY} L ${posB.x} ${midY} L ${posB.x} ${posB.y}`;
                } else {
                  pathData = `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;
                }

                // Suppress breaker pill on very short lines to avoid clutter
                const showBreakerBox = lineDist >= 115;

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

                    {/* STAC Inline Breaker Indicator Box */}
                    {showBreakerBox && (
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
                    )}
                  </g>
                );
              })}

              {/* ========================================================================= */}
              {/* 2. RECTANGULAR BUSBARS (MOVABLE, BOLD, STAC SYMBOLS)                       */}
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
                        x="-60"
                        y="-28"
                        width="120"
                        height="56"
                        rx="8"
                        fill="#500b50"
                        fillOpacity="0.12"
                        stroke="#500b50"
                        strokeWidth="2.5"
                        strokeDasharray="5 3"
                      />
                    )}

                    {/* Generator Infeed Symbol (~ in circle) */}
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

                    {/* Load Drop Symbol (downward arrow) */}
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

                    {/* Heavy Rectangular Copper Busbar (NOT A CIRCLE) */}
                    <rect
                      x="-50"
                      y="-7"
                      width="100"
                      height="14"
                      rx="3"
                      fill={busBarColor}
                      stroke="#000000"
                      strokeWidth="1.8"
                      className={`transition-shadow ${
                        isDragging ? 'filter drop-shadow-lg' : 'group-hover:filter drop-shadow-md'
                      }`}
                    />

                    {/* Substation Name Label */}
                    <text
                      x="0"
                      y="-13"
                      textAnchor="middle"
                      fontSize="12"
                      fontFamily="sans-serif"
                      fontWeight="900"
                      fill="#000000"
                      letterSpacing="0.3px"
                    >
                      {bus.name}
                    </text>

                    {/* Voltage Magnitude Reading */}
                    <text
                      x="0"
                      y={hasLoad && !isGen ? '52' : '25'}
                      textAnchor="middle"
                      fontSize="10.5"
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
          {/* 3. STAC-STYLE TECHNICAL PROPERTY INSPECTOR                                */}
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

              {/* Connected Branch Corridors */}
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