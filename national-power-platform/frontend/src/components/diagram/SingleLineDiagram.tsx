'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { BusData, LineData } from '@/types/grid';
import {
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

// Ray-box intersection for busbar border clipping
function getBusBorderPoint(center: Point, target: Point, halfW = 50, halfH = 7): Point {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return center;
  const scaleX = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Infinity;
  const s = Math.min(scaleX, scaleY);
  return {
    x: center.x + dx * s,
    y: center.y + dy * s,
  };
}

// Tests whether two line segments (p1-p2) and (p3-p4) intersect
function checkSegmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const ccw = (a: Point, b: Point, c: Point) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

// Dynamic Free-Angle Calculation: Finds the widest open angular sector away from connected lines
function computeCleanDecoratorAngles(busPos: Point, neighborPositions: Point[]): { genAngle: number; loadAngle: number } {
  if (!neighborPositions || neighborPositions.length === 0) {
    return { genAngle: -Math.PI / 2, loadAngle: Math.PI / 2 };
  }

  const angles: number[] = neighborPositions.map((np) => Math.atan2(np.y - busPos.y, np.x - busPos.x));
  angles.sort((a, b) => a - b);

  const gaps: { diff: number; mid: number }[] = [];
  for (let i = 0; i < angles.length; i++) {
    const a1 = angles[i];
    const a2 = angles[(i + 1) % angles.length];
    let diff = a2 - a1;
    if (diff <= 0) diff += 2 * Math.PI;

    let mid = a1 + diff / 2.0;
    if (mid > Math.PI) mid -= 2 * Math.PI;
    gaps.push({ diff, mid });
  }

  gaps.sort((a, b) => b.diff - a.diff);

  const genAngle = gaps[0].mid;
  const loadAngle = gaps.length > 1 ? gaps[1].mid : genAngle + Math.PI;

  return { genAngle, loadAngle };
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
  const [scale, setScale] = useState<number>(0.65);
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

  // Keep state refs updated for native non-passive wheel events
  const scaleRef = useRef<number>(scale);
  scaleRef.current = scale;
  const panRef = useRef<Point>(pan);
  panRef.current = pan;

  // =========================================================================
  // Universal STAC Untangler (Circular Seeding + Fruchterman-Reingold + Colliders)
  // =========================================================================
  const solveUntangledLayout = useCallback((): Record<number, Point> => {
    const N = buses.length;
    if (N === 0) return {};

    const idToIndex = new Map<number, number>();
    buses.forEach((b, i) => idToIndex.set(b.id, i));

    // Dynamic canvas dimensions based on network size
    const width = Math.max(1600, N * 60);
    const height = Math.max(1100, N * 45);

    // 1. Initial 360-degree Circular Seeding (Guarantees open loops for 5, 14, 30, or 63 buses)
    const radius = Math.min(width, height) * 0.38;
    const cx = width / 2;
    const cy = height / 2;

    const posArr: Point[] = buses.map((_, i) => {
      const theta = (i / N) * 2 * Math.PI;
      return {
        x: cx + Math.cos(theta) * radius,
        y: cy + Math.sin(theta) * radius,
      };
    });

    const edgePairs: [number, number][] = [];
    lines.forEach((l) => {
      const u = idToIndex.get(l.from_bus);
      const v = idToIndex.get(l.to_bus);
      if (u !== undefined && v !== undefined && u !== v) {
        edgePairs.push([u, v]);
      }
    });

    // 2. Fruchterman-Reingold Force Relaxation with Multi-Pass Colliders
    const area = width * height;
    const k = Math.sqrt(area / Math.max(1, N)) * 1.15;
    const kSq = k * k;

    let temp = width / 7.0;
    const iterations = N > 30 ? 130 : 90;
    const dt = temp / iterations;

    const MIN_NODE_DIST = 210; // Clearance between busbars
    const MIN_EDGE_DIST = 85;  // Clearance from transmission lines

    for (let it = 0; it < iterations; it++) {
      const disp: Point[] = Array.from({ length: N }, () => ({ x: 0, y: 0 }));

      // A. Repulsion between all node pairs
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          const dx = posArr[i].x - posArr[j].x;
          const dy = posArr[i].y - posArr[j].y;
          const dist = Math.hypot(dx, dy) || 1.0;
          if (dist < 1000) {
            const f = kSq / dist;
            disp[i].x += (dx / dist) * f;
            disp[i].y += (dy / dist) * f;
          }
        }
      }

      // B. Spring Attraction along transmission lines
      for (const [u, v] of edgePairs) {
        const dx = posArr[v].x - posArr[u].x;
        const dy = posArr[v].y - posArr[u].y;
        const dist = Math.hypot(dx, dy) || 1.0;
        const f = (dist * dist) / k;
        disp[u].x += (dx / dist) * f;
        disp[u].y += (dy / dist) * f;
        disp[v].x -= (dx / dist) * f;
        disp[v].y -= (dy / dist) * f;
      }

      // C. Node-to-Edge Colliders (Prevents lines from slicing through other nodes)
      for (const [u, v] of edgePairs) {
        const ax = posArr[u].x, ay = posArr[u].y;
        const bx = posArr[v].x, by = posArr[v].y;
        const abx = bx - ax, aby = by - ay;
        const abSq = abx * abx + aby * aby;
        if (abSq < 1.0) continue;

        for (let kIdx = 0; kIdx < N; kIdx++) {
          if (kIdx === u || kIdx === v) continue;
          const px = posArr[kIdx].x, py = posArr[kIdx].y;
          const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abSq));

          if (t > 0.06 && t < 0.94) {
            const projX = ax + t * abx;
            const projY = ay + t * aby;
            const diffX = px - projX;
            const diffY = py - projY;
            const dist = Math.hypot(diffX, diffY) || 1.0;

            if (dist < MIN_EDGE_DIST) {
              const push = (MIN_EDGE_DIST - dist) * 1.4;
              disp[kIdx].x += (diffX / dist) * push;
              disp[kIdx].y += (diffY / dist) * push;
              disp[u].x -= (diffX / dist) * push * 0.5 * (1 - t);
              disp[u].y -= (diffX / dist) * push * 0.5 * (1 - t);
              disp[v].x -= (diffX / dist) * push * 0.5 * t;
              disp[v].y -= (diffX / dist) * push * 0.5 * t;
            }
          }
        }
      }

      // D. Edge-to-Edge Anti-Crossing Forces
      for (let i = 0; i < edgePairs.length; i++) {
        const [u1, v1] = edgePairs[i];
        for (let j = i + 1; j < edgePairs.length; j++) {
          const [u2, v2] = edgePairs[j];
          if (u1 === u2 || u1 === v2 || v1 === u2 || v1 === v2) continue;

          if (checkSegmentsCross(posArr[u1], posArr[v1], posArr[u2], posArr[v2])) {
            const d1x = posArr[v1].x - posArr[u1].x;
            const d1y = posArr[v1].y - posArr[u1].y;
            const len1 = Math.hypot(d1x, d1y) || 1;
            const norm1x = -d1y / len1, norm1y = d1x / len1;

            const d2x = posArr[v2].x - posArr[u2].x;
            const d2y = posArr[v2].y - posArr[u2].y;
            const len2 = Math.hypot(d2x, d2y) || 1;
            const norm2x = -d2y / len2, norm2y = d2x / len2;

            const pushMag = 16.0;
            disp[u1].x += norm2x * pushMag;
            disp[u1].y += norm2y * pushMag;
            disp[v1].x += norm2x * pushMag;
            disp[v1].y += norm2y * pushMag;
            disp[u2].x += norm1x * pushMag;
            disp[u2].y += norm1y * pushMag;
            disp[v2].x += norm1x * pushMag;
            disp[v2].y += norm1y * pushMag;
          }
        }
      }

      // Apply displacements with cooling
      for (let i = 0; i < N; i++) {
        const dLen = Math.hypot(disp[i].x, disp[i].y) || 1.0;
        const step = Math.min(dLen, temp);
        posArr[i].x += (disp[i].x / dLen) * step;
        posArr[i].y += (disp[i].y / dLen) * step;
      }

      temp -= dt;
    }

    // 3. Strict AABB Bounding Box Separation Pass
    const MIN_DX = 210;
    const MIN_DY = 120;

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
              const pushX = overlapX / 2 + 4;
              const sign = dx >= 0 ? 1 : -1;
              posArr[j].x += sign * pushX;
              posArr[i].x -= sign * pushX;
            } else {
              const pushY = overlapY / 2 + 4;
              const sign = dy >= 0 ? 1 : -1;
              posArr[j].y += sign * pushY;
              posArr[i].y -= sign * pushY;
            }
          }
        }
      }
    }

    const finalPositions: Record<number, Point> = {};
    buses.forEach((b, i) => {
      finalPositions[b.id] = {
        x: Math.round(posArr[i].x),
        y: Math.round(posArr[i].y),
      };
    });

    return finalPositions;
  }, [buses, lines]);

  const handleAutoFit = useCallback(() => {
    const positions = Object.values(busPositionsRef.current);
    if (positions.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const w = maxX - minX + 320;
    const h = maxY - minY + 320;
    const containerW = containerRef.current?.clientWidth || 1200;
    const containerH = containerRef.current?.clientHeight || 880;

    const fitScale = Math.min(containerW / w, containerH / h, 1.0);
    const newScale = Math.max(0.18, fitScale);
    const newPan = {
      x: (containerW - w * fitScale) / 2 - minX * fitScale + 160 * fitScale,
      y: (containerH - h * fitScale) / 2 - minY * fitScale + 160 * fitScale,
    };

    setScale(newScale);
    setPan(newPan);
    scaleRef.current = newScale;
    panRef.current = newPan;
  }, []);

  // Compute Layout on Model Load & Persist during Breaker Toggles
  useEffect(() => {
    if (!buses || buses.length === 0) return;

    const isNewModel = currentModelRef.current !== modelName;
    currentModelRef.current = modelName;
    const storageKey = `nesi_sld_pos_${modelName || 'default'}`;

    if (!isNewModel && Object.keys(busPositionsRef.current).length >= buses.length) {
      return;
    }

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

    const layout = solveUntangledLayout();
    setBusPositions(layout);
    busPositionsRef.current = layout;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(layout));
      } catch (_) {}
    }

    const timer = setTimeout(handleAutoFit, 80);
    return () => clearTimeout(timer);
  }, [modelName, buses.length, solveUntangledLayout, handleAutoFit]);

  // =========================================================================
  // Non-Passive Native Wheel Listener: Traps Pinch & Zoom to the SLD Container
  // (Prevents the browser webpage from zooming when hovering over the SLD)
  // =========================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault(); // Traps zoom to canvas; prevents browser window zoom!
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let zoomFactor: number;
      if (e.ctrlKey) {
        // Trackpad pinch gesture
        zoomFactor = Math.exp(-e.deltaY * 0.012);
      } else {
        // Standard mouse scroll wheel
        zoomFactor = e.deltaY < 0 ? 1.14 : 0.88;
      }

      const currScale = scaleRef.current;
      const currPan = panRef.current;
      const nextScale = Math.min(3.5, Math.max(0.12, currScale * zoomFactor));

      const mouseWorldX = (mouseX - currPan.x) / currScale;
      const mouseWorldY = (mouseY - currPan.y) / currScale;

      const nextPan = {
        x: mouseX - mouseWorldX * nextScale,
        y: mouseY - mouseWorldY * nextScale,
      };

      setScale(nextScale);
      setPan(nextPan);
      scaleRef.current = nextScale;
      panRef.current = nextPan;
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

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
      const nextPan = {
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      };
      setPan(nextPan);
      panRef.current = nextPan;
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

  const handleResetLayout = () => {
    if (typeof window !== 'undefined' && modelName) {
      localStorage.removeItem(`nesi_sld_pos_${modelName}`);
    }
    const fresh = solveUntangledLayout();
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
      const nextPan = {
        x: containerW / 2 - pos.x * scale,
        y: containerH / 2 - pos.y * scale,
      };
      setPan(nextPan);
      panRef.current = nextPan;
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
    canvas.width = 3800;
    canvas.height = 2600;
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

  // Pre-calculate clean decorator angles for each bus
  const busDecoratorAngles = useMemo(() => {
    const result: Record<number, { genAngle: number; loadAngle: number }> = {};
    buses.forEach((b) => {
      const bPos = busPositions[b.id] || { x: 0, y: 0 };
      const connectedNeighbors = lines
        .filter((l) => l.from_bus === b.id || l.to_bus === b.id)
        .map((l) => {
          const otherId = l.from_bus === b.id ? l.to_bus : l.from_bus;
          return busPositions[otherId];
        })
        .filter(Boolean);

      result[b.id] = computeCleanDecoratorAngles(bPos, connectedNeighbors);
    });
    return result;
  }, [buses, lines, busPositions]);

  // STAC MultiLineEdge normal vector grouping: Prevents parallel lines from overlapping
  const multiLineOffsets = useMemo(() => {
    const corridorMap = new Map<string, number[]>();
    lines.forEach((l) => {
      const key = l.from_bus < l.to_bus ? `${l.from_bus}_${l.to_bus}` : `${l.to_bus}_${l.from_bus}`;
      if (!corridorMap.has(key)) corridorMap.set(key, []);
      corridorMap.get(key)!.push(l.id);
    });

    const offsetMap = new Map<number, number>();
    corridorMap.forEach((lineIds) => {
      const count = lineIds.length;
      lineIds.forEach((id, idx) => {
        const offset = (idx - (count - 1) / 2) * 24; // 24px parallel lane separation
        offsetMap.set(id, offset);
      });
    });
    return offsetMap;
  }, [lines]);

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
            {buses.length} Substations • {lines.length} Corridors • Topological planarity with line colliders. Pinch touchpad or mouse wheel to zoom.
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

          {/* Scale Indicator & Full Auto-Fit View */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1 shadow-2xs text-xs font-mono font-bold text-slate-700 gap-2">
            <span>{Math.round(scale * 100)}%</span>
            <button
              onClick={handleAutoFit}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 border-l border-slate-200 pl-2"
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

      {/* Main Spacious Canvas Area (880px Height) */}
      <div className="relative w-full">
        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
            <span>Pinch Touchpad or Scroll to Zoom Around Cursor • Drag any Bus to Move</span>
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
              {/* 1. TRANSMISSION LINES WITH STAC MULTI-LINE OFFSETS & ROTATED BREAKERS     */}
              {/* ========================================================================= */}
              {lines.map((line) => {
                const rawPosA = busPositions[line.from_bus];
                const rawPosB = busPositions[line.to_bus];
                if (!rawPosA || !rawPosB) return null;

                // STAC MultiLineEdge normal vector offset
                const laneOffset = multiLineOffsets.get(line.id) || 0;
                const cdx = rawPosB.x - rawPosA.x;
                const cdy = rawPosB.y - rawPosA.y;
                const cLen = Math.hypot(cdx, cdy) || 1;
                const normX = -cdy / cLen;
                const normY = cdx / cLen;

                const shiftedPosA = { x: rawPosA.x + normX * laneOffset, y: rawPosA.y + normY * laneOffset };
                const shiftedPosB = { x: rawPosB.x + normX * laneOffset, y: rawPosB.y + normY * laneOffset };

                // Border-to-border clipping so lines cleanly meet the busbar edge
                const posA = getBusBorderPoint(shiftedPosA, shiftedPosB, 50, 7);
                const posB = getBusBorderPoint(shiftedPosB, shiftedPosA, 50, 7);

                const isTripped = trippedLines.includes(line.id);
                const loadingPercent = line.loading_percent ?? 0;
                const isOverload = loadingPercent > 100;
                const lineColor = isTripped ? '#dc2626' : isOverload ? '#ea580c' : '#000000';
                const flow = line.flow_mw ?? line.p_mw ?? 0;

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const lineDist = Math.hypot(dx, dy);
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                // Rotation angle for breaker box alignment
                let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                let textFlipped = false;
                if (angleDeg > 90 || angleDeg < -90) {
                  textFlipped = true;
                }

                let pathData = '';
                if (viewStyle === 'orthogonal') {
                  pathData = `M ${posA.x} ${posA.y} L ${posA.x} ${midY} L ${posB.x} ${midY} L ${posB.x} ${posB.y}`;
                } else {
                  pathData = `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;
                }

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

                    {/* STAC Inline Breaker Indicator */}
                    {showBreakerBox && (
                      <g transform={`translate(${midX}, ${midY}) rotate(${angleDeg})`}>
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
                          y="3.5"
                          textAnchor="middle"
                          fontSize="9.5"
                          fontFamily="monospace"
                          fontWeight="900"
                          fill={isTripped ? '#dc2626' : isOverload ? '#c2410c' : '#000000'}
                          transform={textFlipped ? 'rotate(180)' : undefined}
                        >
                          {isTripped ? 'OPEN' : `${Math.abs(flow).toFixed(0)}M`}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* ========================================================================= */}
              {/* 2. RECTANGULAR BUSBARS WITH CALCULATED FREE-ANGLE ATTACHMENTS             */}
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
                const { genAngle, loadAngle } = busDecoratorAngles[bus.id] || {
                  genAngle: -Math.PI / 2,
                  loadAngle: Math.PI / 2,
                };

                // Free-angle coordinates for Generator
                const genStubLen = 38;
                const genX = Math.cos(genAngle) * genStubLen;
                const genY = Math.sin(genAngle) * genStubLen;
                const genBorder = getBusBorderPoint(pos, { x: pos.x + genX, y: pos.y + genY }, 50, 7);
                const relGenBorderX = genBorder.x - pos.x;
                const relGenBorderY = genBorder.y - pos.y;

                // Free-angle coordinates for Load
                const loadStubStart = 12;
                const loadStubEnd = 38;
                const loadStartX = Math.cos(loadAngle) * loadStubStart;
                const loadStartY = Math.sin(loadAngle) * loadStubStart;
                const loadEndX = Math.cos(loadAngle) * loadStubEnd;
                const loadEndY = Math.sin(loadAngle) * loadStubEnd;

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
                      <g>
                        <line
                          x1={relGenBorderX}
                          y1={relGenBorderY}
                          x2={genX}
                          y2={genY}
                          stroke="#000000"
                          strokeWidth="2.5"
                        />
                        <circle cx={genX} cy={genY} r="14" fill="#ffffff" stroke="#000000" strokeWidth="2.5" />
                        <path
                          d={`M ${genX - 6} ${genY} Q ${genX - 3} ${genY - 5.5} ${genX} ${genY} T ${genX + 6} ${genY}`}
                          fill="none"
                          stroke="#000000"
                          strokeWidth="2.5"
                        />
                        <text
                          x={genX}
                          y={genY - 17}
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

                    {/* Load Drop Symbol */}
                    {hasLoad && !isGen && (
                      <g>
                        <line
                          x1={loadStartX}
                          y1={loadStartY}
                          x2={loadEndX}
                          y2={loadEndY}
                          stroke="#000000"
                          strokeWidth="2.5"
                          markerEnd="url(#loadArrow)"
                        />
                        <text
                          x={loadEndX + Math.cos(loadAngle) * 14}
                          y={loadEndY + Math.sin(loadAngle) * 14 + 3.5}
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

                    {/* Rectangular Copper Busbar (NOT A CIRCLE) */}
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
                      y="23"
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