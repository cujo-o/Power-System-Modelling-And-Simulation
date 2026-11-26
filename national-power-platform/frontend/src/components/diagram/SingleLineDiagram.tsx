'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Maximize2,
  RotateCcw,
  Download,
  Image as ImageIcon,
  FileSpreadsheet,
  Search,
  Layers,
  X,
  Compass,
  Power,
} from 'lucide-react';
import { BusData, LineData } from '@/types/grid';

interface SingleLineDiagramProps {
  buses: BusData[];
  lines: LineData[];
  trippedLines: number[];
  toggleLine: (id: number) => void;
  resetTrippedLines: () => void;
  selectedBusId: number | null;
  setSelectedBusId: (id: number | null) => void;
  modelName: string;
}

interface Point {
  x: number;
  y: number;
}

/** Ray-box intersection clipping a line endpoint cleanly against a 76x9 px busbar rectangle. */
function getBusBorderPoint(center: Point, target: Point, halfW = 38, halfH = 5): Point {
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

/** Orientation test checking whether segments (p1, p2) and (p3, p4) intersect. */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const ccw = (a: Point, b: Point, c: Point) =>
    (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/** Picks the two widest open angular sectors around a bus for placing generator/load symbols. */
function computeDecoratorAngles(
  busPos: Point,
  neighborPositions: Point[]
): { genAngle: number; loadAngle: number } {
  if (neighborPositions.length === 0) {
    return { genAngle: -Math.PI / 2, loadAngle: Math.PI / 2 };
  }

  const angles = neighborPositions
    .map((np) => Math.atan2(np.y - busPos.y, np.x - busPos.x))
    .sort((a, b) => a - b);

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

function serializeSvgWithBounds(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(1200, Math.round(rect.width || 1200));
  const height = Math.max(850, Math.round(rect.height || 850));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return new XMLSerializer().serializeToString(clone);
}

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = ({
  buses = [],
  lines = [],
  trippedLines = [],
  toggleLine,
  resetTrippedLines,
  selectedBusId,
  setSelectedBusId,
  modelName,
}) => {
  const [viewStyle, setViewStyle] = useState<'direct' | 'orthogonal'>('direct');
  const [searchQuery, setSearchQuery] = useState('');

  // Viewport transform state
  const [scale, setScale] = useState<number>(0.85);
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });

  // Draggable bus coordinates (persisted per model in localStorage)
  const [busPositions, setBusPositions] = useState<Record<number, Point>>({});
  const busPositionsRef = useRef<Record<number, Point>>({});
  const busesRef = useRef<BusData[]>(buses);
  const linesRef = useRef<LineData[]>(lines);

  const [draggingBusId, setDraggingBusId] = useState<number | null>(null);
  const draggingBusIdRef = useRef<number | null>(null);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const hasDraggedRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const currentModelRef = useRef<string>('');

  const scaleRef = useRef<number>(scale);
  const panRef = useRef<Point>(pan);

  useEffect(() => {
    busPositionsRef.current = busPositions;
    busesRef.current = buses;
    linesRef.current = lines;
    scaleRef.current = scale;
    panRef.current = pan;
  }, [busPositions, buses, lines, scale, pan]);

  const trippedSet = useMemo(() => new Set(trippedLines), [trippedLines]);
  const selectedBus = useMemo(
    () => (selectedBusId === null ? null : buses.find((b) => b.id === selectedBusId) ?? null),
    [buses, selectedBusId]
  );

  /**
   * Computes a compact force-directed busbar layout with BFS circular seeding,
   * adaptive iteration limits, and bounding-box separation so large (300+ bus)
   * networks render smoothly without blocking the main thread.
   */
  const computeLayout = useCallback((): Record<number, Point> => {
    const currentBuses = busesRef.current;
    const currentLines = linesRef.current;
    const N = currentBuses.length;
    if (N === 0) return {};

    const idToIndex = new Map<number, number>();
    currentBuses.forEach((b, i) => idToIndex.set(b.id, i));

    const adj: number[][] = Array.from({ length: N }, () => []);
    const edgePairs: [number, number][] = [];
    const seenEdges = new Set<string>();

    currentLines.forEach((l) => {
      const u = idToIndex.get(l.from_bus);
      const v = idToIndex.get(l.to_bus);
      if (u !== undefined && v !== undefined && u !== v) {
        const key = u < v ? `${u}_${v}` : `${v}_${u}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          adj[u].push(v);
          adj[v].push(u);
          edgePairs.push([u, v]);
        }
      }
    });

    // BFS ordering places topologically close substations near each other on the initial ring
    const visited = new Set<number>();
    const bfsOrder: number[] = [];
    for (let i = 0; i < N; i++) {
      if (visited.has(i)) continue;
      const queue = [i];
      visited.add(i);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        bfsOrder.push(curr);
        for (const nbr of adj[curr]) {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        }
      }
    }

    const radius = N <= 8 ? 130 : Math.min(480, N * 8);
    const cx = 800;
    const cy = 550;

    const posArr: Point[] = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
    bfsOrder.forEach((nodeIdx, orderIdx) => {
      const theta = (orderIdx / N) * 2 * Math.PI;
      posArr[nodeIdx] = {
        x: cx + Math.cos(theta) * radius,
        y: cy + Math.sin(theta) * radius,
      };
    });

    const idealEdgeLen = N <= 8 ? 130 : Math.max(85, 125 - N * 0.35);
    const kSq = idealEdgeLen * idealEdgeLen;
    const iterations = N > 120 ? 60 : N > 30 ? 110 : 85;
    let temp = Math.min(130, radius * 0.7);
    const dt = temp / iterations;
    const minEdgeDist = 55;
    const enableNodeEdgeRepulsion = N <= 150;
    const enableEdgeUncrossing = edgePairs.length <= 150;

    for (let it = 0; it < iterations; it++) {
      const dispX = new Float64Array(N);
      const dispY = new Float64Array(N);

      // Node-node repulsion (symmetric pair pass with AABB early reject)
      for (let i = 0; i < N; i++) {
        const ix = posArr[i].x;
        const iy = posArr[i].y;
        for (let j = i + 1; j < N; j++) {
          const dx = ix - posArr[j].x;
          const dy = iy - posArr[j].y;
          if (Math.abs(dx) > 600 || Math.abs(dy) > 600) continue;
          const dist = Math.hypot(dx, dy) || 1.0;
          if (dist < 600) {
            const f = kSq / dist;
            const fx = (dx / dist) * f;
            const fy = (dy / dist) * f;
            dispX[i] += fx;
            dispY[i] += fy;
            dispX[j] -= fx;
            dispY[j] -= fy;
          }
        }
      }

      // Spring attraction along connected transmission corridors
      for (let e = 0; e < edgePairs.length; e++) {
        const [u, v] = edgePairs[e];
        const dx = posArr[v].x - posArr[u].x;
        const dy = posArr[v].y - posArr[u].y;
        const dist = Math.hypot(dx, dy) || 1.0;
        const f = (dist * dist) / idealEdgeLen;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        dispX[u] += fx;
        dispY[u] += fy;
        dispX[v] -= fx;
        dispY[v] -= fy;
      }

      // Node-to-edge clearance push (medium/small grids)
      if (enableNodeEdgeRepulsion) {
        for (let e = 0; e < edgePairs.length; e++) {
          const [u, v] = edgePairs[e];
          const ax = posArr[u].x;
          const ay = posArr[u].y;
          const bx = posArr[v].x;
          const by = posArr[v].y;
          const abx = bx - ax;
          const aby = by - ay;
          const abSq = abx * abx + aby * aby;
          if (abSq < 1.0) continue;

          const minX = Math.min(ax, bx) - minEdgeDist;
          const maxX = Math.max(ax, bx) + minEdgeDist;
          const minY = Math.min(ay, by) - minEdgeDist;
          const maxY = Math.max(ay, by) + minEdgeDist;

          for (let kIdx = 0; kIdx < N; kIdx++) {
            if (kIdx === u || kIdx === v) continue;
            const px = posArr[kIdx].x;
            const py = posArr[kIdx].y;
            if (px < minX || px > maxX || py < minY || py > maxY) continue;

            const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abSq));
            if (t <= 0.08 || t >= 0.92) continue;

            const diffX = px - (ax + t * abx);
            const diffY = py - (ay + t * aby);
            const dist = Math.hypot(diffX, diffY) || 1.0;
            if (dist < minEdgeDist) {
              const push = (minEdgeDist - dist) * 1.2;
              const nx = (diffX / dist) * push;
              const ny = (diffY / dist) * push;
              dispX[kIdx] += nx;
              dispY[kIdx] += ny;
              dispX[u] -= nx * 0.4 * (1 - t);
              dispY[u] -= ny * 0.4 * (1 - t);
              dispX[v] -= nx * 0.4 * t;
              dispY[v] -= ny * 0.4 * t;
            }
          }
        }
      }

      // Edge-to-edge uncrossing pass (small/medium grids)
      if (enableEdgeUncrossing) {
        for (let i = 0; i < edgePairs.length; i++) {
          const [u1, v1] = edgePairs[i];
          for (let j = i + 1; j < edgePairs.length; j++) {
            const [u2, v2] = edgePairs[j];
            if (u1 === u2 || u1 === v2 || v1 === u2 || v1 === v2) continue;
            if (!segmentsIntersect(posArr[u1], posArr[v1], posArr[u2], posArr[v2])) continue;

            const d1x = posArr[v1].x - posArr[u1].x;
            const d1y = posArr[v1].y - posArr[u1].y;
            const len1 = Math.hypot(d1x, d1y) || 1;
            const norm1x = -d1y / len1;
            const norm1y = d1x / len1;

            const d2x = posArr[v2].x - posArr[u2].x;
            const d2y = posArr[v2].y - posArr[u2].y;
            const len2 = Math.hypot(d2x, d2y) || 1;
            const norm2x = -d2y / len2;
            const norm2y = d2x / len2;

            const pushMag = 12.0;
            dispX[u1] += norm2x * pushMag;
            dispY[u1] += norm2y * pushMag;
            dispX[v1] += norm2x * pushMag;
            dispY[v1] += norm2y * pushMag;
            dispX[u2] += norm1x * pushMag;
            dispY[u2] += norm1y * pushMag;
            dispX[v2] += norm1x * pushMag;
            dispY[v2] += norm1y * pushMag;
          }
        }
      }

      for (let i = 0; i < N; i++) {
        const dLen = Math.hypot(dispX[i], dispY[i]) || 1.0;
        const step = Math.min(dLen, temp);
        posArr[i].x += (dispX[i] / dLen) * step;
        posArr[i].y += (dispY[i] / dLen) * step;
      }

      temp -= dt;
    }

    // Bounding-box overlap separation so busbar labels never collide
    const minDx = 92;
    const minDy = 55;
    const sepPasses = N > 120 ? 12 : 24;
    for (let pass = 0; pass < sepPasses; pass++) {
      let moved = false;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = posArr[j].x - posArr[i].x;
          const dy = posArr[j].y - posArr[i].y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (absDx < minDx && absDy < minDy) {
            moved = true;
            const overlapX = minDx - absDx;
            const overlapY = minDy - absDy;
            if (overlapX < overlapY) {
              const pushX = overlapX / 2 + 2;
              const sign = dx >= 0 ? 1 : -1;
              posArr[j].x += sign * pushX;
              posArr[i].x -= sign * pushX;
            } else {
              const pushY = overlapY / 2 + 2;
              const sign = dy >= 0 ? 1 : -1;
              posArr[j].y += sign * pushY;
              posArr[i].y -= sign * pushY;
            }
          }
        }
      }
      if (!moved) break;
    }

    const finalPositions: Record<number, Point> = {};
    currentBuses.forEach((b, i) => {
      finalPositions[b.id] = {
        x: Math.round(posArr[i].x),
        y: Math.round(posArr[i].y),
      };
    });
    return finalPositions;
  }, []);

  const handleAutoFit = useCallback(() => {
    const positions = Object.values(busPositionsRef.current);
    if (positions.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    positions.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const w = maxX - minX + 220;
    const h = maxY - minY + 220;
    const containerW = containerRef.current?.clientWidth || 1200;
    const containerH = containerRef.current?.clientHeight || 850;

    const fitScale = Math.min(containerW / w, containerH / h, 1.25);
    const newScale = Math.max(0.3, fitScale);
    const newPan = {
      x: (containerW - w * newScale) / 2 - minX * newScale + 110 * newScale,
      y: (containerH - h * newScale) / 2 - minY * newScale + 110 * newScale,
    };

    setScale(newScale);
    setPan(newPan);
    scaleRef.current = newScale;
    panRef.current = newPan;
  }, []);

  // Recompute layout only when the model or bus count changes (not on breaker toggles)
  useEffect(() => {
    if (!buses || buses.length === 0) return;

    const isNewModel = currentModelRef.current !== modelName;
    currentModelRef.current = modelName;
    const storageKey = `nesi_sld_pos_${modelName || 'default'}`;

    if (
      !isNewModel &&
      Object.keys(busPositionsRef.current).length >= buses.length &&
      buses.every((b) => busPositionsRef.current[b.id] !== undefined)
    ) {
      return;
    }

    let fitTimer: ReturnType<typeof setTimeout> | null = null;
    const frameId = requestAnimationFrame(() => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (buses.every((b) => parsed[b.id] !== undefined)) {
              busPositionsRef.current = parsed;
              setBusPositions(parsed);
              if (isNewModel) {
                fitTimer = setTimeout(handleAutoFit, 60);
              }
              return;
            }
          } catch {}
        }
      }

      const layout = computeLayout();
      busPositionsRef.current = layout;
      setBusPositions(layout);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(layout));
        } catch {}
      }
      fitTimer = setTimeout(handleAutoFit, 80);
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (fitTimer) clearTimeout(fitTimer);
    };
  }, [modelName, buses, computeLayout, handleAutoFit]);

  // Non-passive wheel zoom centered on cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let zoomFactor: number;
      if (e.ctrlKey) {
        const clampedDelta = Math.max(-30, Math.min(30, e.deltaY));
        zoomFactor = Math.exp(-clampedDelta * 0.005);
      } else {
        const clampedDelta = Math.max(-80, Math.min(80, e.deltaY));
        zoomFactor = Math.exp(-clampedDelta * 0.0018);
      }

      zoomFactor = Math.min(1.06, Math.max(0.94, zoomFactor));

      const currScale = scaleRef.current;
      const currPan = panRef.current;
      const nextScale = Math.min(3.5, Math.max(0.25, currScale * zoomFactor));

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
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const getSvgCoordinates = useCallback((clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / scaleRef.current,
      y: (clientY - rect.top - panRef.current.y) / scaleRef.current,
    };
  }, []);

  // Window-level mouse drag and pan listeners throttled to animation frames
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      const activeBusId = draggingBusIdRef.current;
      if (activeBusId === null && !isPanning) return;

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const clientX = e.clientX;
      const clientY = e.clientY;

      rafRef.current = requestAnimationFrame(() => {
        if (draggingBusIdRef.current !== null) {
          hasDraggedRef.current = true;
          const busId = draggingBusIdRef.current;
          const mouseWorld = getSvgCoordinates(clientX, clientY);
          const newPos = {
            x: mouseWorld.x - dragOffsetRef.current.x,
            y: mouseWorld.y - dragOffsetRef.current.y,
          };
          setBusPositions((prev) => {
            const next = { ...prev, [busId]: newPos };
            busPositionsRef.current = next;
            return next;
          });
        } else if (isPanning) {
          const nextPan = {
            x: clientX - panStartRef.current.x,
            y: clientY - panStartRef.current.y,
          };
          setPan(nextPan);
          panRef.current = nextPan;
        }
      });
    };

    const handleWindowMouseUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (isPanning) setIsPanning(false);
      if (draggingBusIdRef.current !== null) {
        draggingBusIdRef.current = null;
        setDraggingBusId(null);
        if (typeof window !== 'undefined' && modelName) {
          try {
            localStorage.setItem(
              `nesi_sld_pos_${modelName}`,
              JSON.stringify(busPositionsRef.current)
            );
          } catch {}
        }
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPanning, modelName, getSvgCoordinates]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
  };

  const handleBusMouseDown = (e: React.MouseEvent, busId: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const mouseWorld = getSvgCoordinates(e.clientX, e.clientY);
    const busPos = busPositionsRef.current[busId] || { x: 200, y: 200 };

    draggingBusIdRef.current = busId;
    setDraggingBusId(busId);
    hasDraggedRef.current = false;
    dragOffsetRef.current = {
      x: mouseWorld.x - busPos.x,
      y: mouseWorld.y - busPos.y,
    };
  };

  const handleResetLayout = () => {
    if (typeof window !== 'undefined' && modelName) {
      localStorage.removeItem(`nesi_sld_pos_${modelName}`);
    }
    const fresh = computeLayout();
    setBusPositions(fresh);
    busPositionsRef.current = fresh;
    if (typeof window !== 'undefined' && modelName) {
      try {
        localStorage.setItem(`nesi_sld_pos_${modelName}`, JSON.stringify(fresh));
      } catch {}
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
      setSelectedBusId(busId);
    }
  };

  const exportAsPNG = () => {
    if (!svgRef.current) return;
    const svgStr = serializeSvgWithBounds(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
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
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `SLD_${modelName || 'Grid'}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const exportAsSVG = () => {
    if (!svgRef.current) return;
    const source = serializeSvgWithBounds(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SLD_${modelName || 'Grid'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = () => {
    const rows = [
      'ELEMENT,ID,NAME,FROM_BUS,TO_BUS,FLOW_MW,LOADING_PERCENT,VOLTAGE_PU,ANGLE_DEG,STATUS',
    ];
    buses.forEach((b) => {
      rows.push(
        `BUS,#${b.id},"${b.name.replace(/"/g, '""')}",-,-,${b.p_mw ?? 0},-,${(b.v_pu ?? 1.0).toFixed(
          3
        )},${(b.va_deg ?? 0.0).toFixed(2)},OPERATIONAL`
      );
    });
    lines.forEach((l) => {
      const isTripped = trippedSet.has(l.id);
      const flow = l.flow_mw ?? l.p_mw ?? 0;
      const load = l.loading_percent ?? 0;
      rows.push(
        `LINE,#${l.id},"${l.name.replace(/"/g, '""')}",#${l.from_bus},#${l.to_bus},${
          isTripped ? 0 : flow.toFixed(1)
        },${isTripped ? 0 : load.toFixed(1)}%,-,-,${isTripped ? 'TRIPPED' : 'IN_SERVICE'}`
      );
    });

    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Topology_${modelName || 'Grid'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pre-index neighbor bus IDs once per topology (O(E) instead of O(N*E) per drag frame)
  const busNeighborsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    lines.forEach((l) => {
      if (!map.has(l.from_bus)) map.set(l.from_bus, []);
      if (!map.has(l.to_bus)) map.set(l.to_bus, []);
      map.get(l.from_bus)!.push(l.to_bus);
      map.get(l.to_bus)!.push(l.from_bus);
    });
    return map;
  }, [lines]);

  const busDecoratorAngles = useMemo(() => {
    const result: Record<number, { genAngle: number; loadAngle: number }> = {};
    buses.forEach((b) => {
      const bPos = busPositions[b.id];
      if (!bPos) return;
      const nbrIds = busNeighborsMap.get(b.id) || [];
      const nbrPositions: Point[] = [];
      for (const nid of nbrIds) {
        const np = busPositions[nid];
        if (np) nbrPositions.push(np);
      }
      result[b.id] = computeDecoratorAngles(bPos, nbrPositions);
    });
    return result;
  }, [buses, busNeighborsMap, busPositions]);

  // Perpendicular lane offsets so parallel circuits between the same bus pair do not overlap
  const multiLineOffsets = useMemo(() => {
    const corridorMap = new Map<string, number[]>();
    lines.forEach((l) => {
      const key =
        l.from_bus < l.to_bus ? `${l.from_bus}_${l.to_bus}` : `${l.to_bus}_${l.from_bus}`;
      if (!corridorMap.has(key)) corridorMap.set(key, []);
      corridorMap.get(key)!.push(l.id);
    });

    const offsetMap = new Map<number, number>();
    corridorMap.forEach((lineIds) => {
      const count = lineIds.length;
      lineIds.forEach((id, idx) => {
        offsetMap.set(id, (idx - (count - 1) / 2) * 18);
      });
    });
    return offsetMap;
  }, [lines]);

  return (
    <div className="space-y-3 max-w-7xl mx-auto py-1">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-3">
        <div>
          <p className="text-xs text-slate-600 font-semibold">
            {modelName} • {buses.length} Substations • {lines.length} Corridors
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Substation Search */}
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

          {trippedLines.length > 0 && (
            <button
              onClick={resetTrippedLines}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition shadow-2xs"
              title="Reclose all tripped line breakers"
            >
              <Power className="h-3.5 w-3.5" />
              <span>Reclose All ({trippedLines.length})</span>
            </button>
          )}

          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
            title="Recalculate automatic bus layout"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Layout</span>
          </button>

          {/* Line Routing Style */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-2xs">
            <button
              onClick={() => setViewStyle('direct')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewStyle === 'direct'
                  ? 'bg-[#500b50] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Direct</span>
            </button>
            <button
              onClick={() => setViewStyle('orthogonal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewStyle === 'orthogonal'
                  ? 'bg-[#500b50] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Orthogonal</span>
            </button>
          </div>

          {/* Zoom & Fit */}
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
              title="Export PNG"
            >
              <ImageIcon className="h-3.5 w-3.5 text-cyan-600" />
              <span>PNG</span>
            </button>
            <button
              onClick={exportAsSVG}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 rounded text-slate-700 transition border-l border-slate-200"
              title="Export SVG"
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

      {/* Main SVG Canvas */}
      <div className="relative w-full">
        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          className={`h-[850px] w-full rounded-2xl border border-slate-300 bg-white relative overflow-hidden shadow-sm select-none ${
            isPanning ? 'cursor-grabbing' : draggingBusId !== null ? 'cursor-move' : 'cursor-grab'
          }`}
        >
          {buses.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none z-10">
              Select or upload a grid model to render the Single-Line Diagram.
            </div>
          )}

          <svg ref={svgRef} className="w-full h-full" style={{ width: '100%', height: '100%' }}>
            <defs>
              <pattern id="sldDotGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.85" fill="#cbd5e1" opacity="0.8" />
              </pattern>
              <marker
                id="loadArrow"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#000000" />
              </marker>
            </defs>

            <rect
              x="-10000"
              y="-10000"
              width="30000"
              height="30000"
              fill="url(#sldDotGrid)"
              pointerEvents="none"
            />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* Transmission Lines & Inline Breakers */}
              {lines.map((line) => {
                const rawPosA = busPositions[line.from_bus];
                const rawPosB = busPositions[line.to_bus];
                if (!rawPosA || !rawPosB) return null;

                const canonicalFlip = line.from_bus > line.to_bus ? -1 : 1;
                const laneOffset = (multiLineOffsets.get(line.id) || 0) * canonicalFlip;
                const cdx = rawPosB.x - rawPosA.x;
                const cdy = rawPosB.y - rawPosA.y;
                const cLen = Math.hypot(cdx, cdy) || 1;
                const normX = -cdy / cLen;
                const normY = cdx / cLen;

                const shiftedPosA = {
                  x: rawPosA.x + normX * laneOffset,
                  y: rawPosA.y + normY * laneOffset,
                };
                const shiftedPosB = {
                  x: rawPosB.x + normX * laneOffset,
                  y: rawPosB.y + normY * laneOffset,
                };

                const posA = getBusBorderPoint(shiftedPosA, shiftedPosB, 38, 5);
                const posB = getBusBorderPoint(shiftedPosB, shiftedPosA, 38, 5);

                const isTripped = trippedSet.has(line.id) || line.in_service === false;
                const loadingPercent = line.loading_percent ?? 0;
                const isOverload = loadingPercent > 100;
                const lineColor = isTripped ? '#dc2626' : isOverload ? '#ea580c' : '#000000';
                const flow = line.flow_mw ?? line.p_mw ?? 0;

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const lineDist = Math.hypot(dx, dy);
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                const textFlipped = angleDeg > 90 || angleDeg < -90;

                const pathData =
                  viewStyle === 'orthogonal'
                    ? `M ${posA.x} ${posA.y} L ${posA.x} ${midY} L ${posB.x} ${midY} L ${posB.x} ${posB.y}`
                    : `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;

                return (
                  <g
                    key={`line-${line.id}`}
                    className="cursor-pointer group"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLine(line.id);
                    }}
                  >
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="18" />
                    <path
                      d={pathData}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth="2.75"
                      strokeDasharray={isTripped ? '6 4' : undefined}
                      strokeOpacity={isTripped ? 0.45 : 0.95}
                      className="group-hover:stroke-[#500b50]"
                    />

                    {lineDist >= 60 && (
                      <g transform={`translate(${midX}, ${midY}) rotate(${angleDeg})`}>
                        <rect
                          x="-18"
                          y="-7.5"
                          width="36"
                          height="15"
                          rx="2"
                          fill="#ffffff"
                          stroke={lineColor}
                          strokeWidth="1.5"
                          className="transition group-hover:fill-purple-50"
                        />
                        <text
                          x="0"
                          y="2.5"
                          textAnchor="middle"
                          fontSize="8"
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

              {/* Busbars with Generator / Load Attachments */}
              {buses.map((bus) => {
                const pos = busPositions[bus.id];
                if (!pos) return null;

                const isSelected = selectedBusId === bus.id;
                const isDragging = draggingBusId === bus.id;
                const vVal = bus.v_pu ?? 1.0;
                const isUnder = vVal < 0.95;
                const isOver = vVal > 1.05;
                const busBarColor = isUnder ? '#dc2626' : isOver ? '#d97706' : '#000000';

                const isGen =
                  Boolean(bus.is_gen) ||
                  (bus.p_mw ?? 0) < -20 ||
                  /\b(gs|ps|slack)\b/i.test(bus.name || '');

                const hasLoad = Boolean(bus.is_load) || (bus.p_mw ?? 0) > 10;
                const { genAngle, loadAngle } = busDecoratorAngles[bus.id] || {
                  genAngle: -Math.PI / 2,
                  loadAngle: Math.PI / 2,
                };

                const genStubLen = 28;
                const genX = Math.cos(genAngle) * genStubLen;
                const genY = Math.sin(genAngle) * genStubLen;
                const genBorder = getBusBorderPoint(
                  pos,
                  { x: pos.x + genX, y: pos.y + genY },
                  38,
                  5
                );
                const relGenBorderX = genBorder.x - pos.x;
                const relGenBorderY = genBorder.y - pos.y;

                const loadStartX = Math.cos(loadAngle) * 9;
                const loadStartY = Math.sin(loadAngle) * 9;
                const loadEndX = Math.cos(loadAngle) * 28;
                const loadEndY = Math.sin(loadAngle) * 28;

                return (
                  <g
                    key={`bus-${bus.id}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onMouseDown={(e) => handleBusMouseDown(e, bus.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!hasDraggedRef.current) {
                        setSelectedBusId(bus.id);
                      }
                    }}
                    className="cursor-move group"
                  >
                    {isSelected && (
                      <rect
                        x="-46"
                        y="-20"
                        width="92"
                        height="40"
                        rx="6"
                        fill="#500b50"
                        fillOpacity="0.12"
                        stroke="#500b50"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                    )}

                    {isGen && (
                      <g>
                        <line
                          x1={relGenBorderX}
                          y1={relGenBorderY}
                          x2={genX}
                          y2={genY}
                          stroke="#000000"
                          strokeWidth="2"
                        />
                        <circle
                          cx={genX}
                          cy={genY}
                          r="11"
                          fill="#ffffff"
                          stroke="#000000"
                          strokeWidth="2"
                        />
                        <path
                          d={`M ${genX - 5} ${genY} Q ${genX - 2.5} ${genY - 4.5} ${genX} ${genY} T ${genX + 5} ${genY}`}
                          fill="none"
                          stroke="#000000"
                          strokeWidth="2"
                        />
                        <text
                          x={genX}
                          y={genY - 14}
                          textAnchor="middle"
                          fontSize="9"
                          fill="#000000"
                          fontFamily="monospace"
                          fontWeight="900"
                        >
                          {Math.abs(bus.p_mw ?? 0).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {hasLoad && !isGen && (
                      <g>
                        <line
                          x1={loadStartX}
                          y1={loadStartY}
                          x2={loadEndX}
                          y2={loadEndY}
                          stroke="#000000"
                          strokeWidth="2"
                          markerEnd="url(#loadArrow)"
                        />
                        <text
                          x={loadEndX + Math.cos(loadAngle) * 11}
                          y={loadEndY + Math.sin(loadAngle) * 11 + 3}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="900"
                          fill="#1e293b"
                        >
                          {(bus.p_mw ?? 0).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    <rect
                      x="-38"
                      y="-4.5"
                      width="76"
                      height="9"
                      rx="2"
                      fill={busBarColor}
                      stroke="#000000"
                      strokeWidth="1.4"
                      className={`transition-shadow ${
                        isDragging ? 'filter drop-shadow-lg' : 'group-hover:filter drop-shadow-md'
                      }`}
                    />

                    <text
                      x="0"
                      y="-10"
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="sans-serif"
                      fontWeight="900"
                      fill="#000000"
                      letterSpacing="0.2px"
                    >
                      {bus.name}
                    </text>

                    <text
                      x="0"
                      y="18"
                      textAnchor="middle"
                      fontSize="9"
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

          {/* Live Bus Telemetry Inspector */}
          {selectedBus && (
            <div className="absolute top-4 right-4 z-20 w-80 rounded-2xl border border-slate-300 bg-white/95 backdrop-blur-md shadow-2xl p-4 text-xs font-sans">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-3 w-3 rounded-full bg-[#500b50] shrink-0" />
                  <span className="font-black text-slate-900 text-sm truncate">
                    Bus {selectedBus.id} ({selectedBus.name})
                  </span>
                </div>
                <button
                  onClick={() => setSelectedBusId(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

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
                      <td className="py-1 px-2.5 font-bold">Bus ID</td>
                      <td className="py-1 px-2.5 font-mono font-bold">{selectedBus.id}</td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Zone</td>
                      <td className="py-1 px-2.5 font-semibold">
                        {selectedBus.zone || 'Transmission'}
                      </td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Base kV</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {selectedBus.vn_kv || 330.0}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">kV</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Voltage Envelope</td>
                      <td className="py-1 px-2.5 font-mono font-bold text-slate-700">0.95 – 1.05</td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">pu</td>
                    </tr>

                    <tr className="bg-slate-50/70 font-bold text-slate-500 text-[10px]">
                      <td colSpan={3} className="py-1 px-2.5 uppercase tracking-wider">
                        Power Flow Result
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Voltage |V|</td>
                      <td className="py-1 px-2.5 font-mono font-black text-[#500b50]">
                        {(selectedBus.v_pu ?? 1.0).toFixed(4)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">pu</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Phase Angle</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(selectedBus.va_deg ?? 0.0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">deg</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Active Power</td>
                      <td className="py-1 px-2.5 font-mono font-black">
                        {(selectedBus.p_mw ?? 0).toFixed(1)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MW</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Reactive Power</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(selectedBus.q_mvar ?? 0).toFixed(1)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MVAR</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <span className="text-[10px] uppercase font-black text-slate-500 block tracking-wider mb-1.5">
                  Connected Branch Corridors
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {lines
                    .filter((l) => l.from_bus === selectedBus.id || l.to_bus === selectedBus.id)
                    .map((l) => {
                      const isTripped = trippedSet.has(l.id);
                      return (
                        <div
                          key={l.id}
                          className="flex items-center justify-between p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[10px]"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-slate-900 block truncate">
                              {l.name}
                            </span>
                            <span className="font-mono text-slate-500 text-[9px] font-semibold">
                              {(l.flow_mw ?? l.p_mw ?? 0).toFixed(1)} MW •{' '}
                              {(l.loading_percent ?? 0).toFixed(0)}% load
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
