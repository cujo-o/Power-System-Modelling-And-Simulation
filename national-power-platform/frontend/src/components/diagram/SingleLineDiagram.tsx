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

const BUS_HALF_W = 38;
const BUS_HALF_H = 4.5;

/**
 * Continuous Ray-Rectangle Intersection (STAC BaseEdge / MultiLineEdge style).
 * Smoothly docks line endpoints to the exact perimeter of the 76x9 flat busbar
 * without discontinuous jumping when dragging nodes around each other.
 */
function getContinuousBusDockPoint(
  sourceCenter: Point,
  targetCenter: Point,
  laneOffset = 0,
  halfW = BUS_HALF_W,
  halfH = BUS_HALF_H
): Point {
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return sourceCenter;

  const ux = dx / len;
  const uy = dy / len;

  // Perpendicular normal vector for parallel circuit separation
  const nx = -uy;
  const ny = ux;

  // Shift origin along the busbar's width/height for parallel circuits
  const originX = sourceCenter.x + nx * laneOffset * 0.85;
  const originY = sourceCenter.y + ny * laneOffset * 0.35;

  // Ray-box intersection from shifted origin along direction (ux, uy)
  const tx = Math.abs(ux) > 1e-5 ? halfW / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-5 ? halfH / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);

  return {
    x: originX + ux * t,
    y: originY + uy * t,
  };
}

/**
 * STAC-inspired Shortest-Path Stress Majorization + Component Packing + Non-Overlap Solver.
 * Handles 5-bus test cases, 63-bus 330kV grids, and 369-bus 132kV multi-island networks cleanly.
 */
function computeStacPlanarLayout(buses: BusData[], lines: LineData[]): Record<number, Point> {
  const N = buses.length;
  if (N === 0) return {};

  const idToIdx = new Map<number, number>();
  buses.forEach((b, idx) => idToIdx.set(b.id, idx));

  // Build adjacency list & unique undirected edges
  const adj: number[][] = Array.from({ length: N }, () => []);
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];

  lines.forEach((l) => {
    const u = idToIdx.get(l.from_bus);
    const v = idToIdx.get(l.to_bus);
    if (u !== undefined && v !== undefined && u !== v) {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        adj[u].push(v);
        adj[v].push(u);
        edges.push([u, v]);
      }
    }
  });

  // 1. Decompose into Connected Components (prevents disconnected 132kV islands from scattering)
  const visited = new Uint8Array(N);
  const components: number[][] = [];

  for (let i = 0; i < N; i++) {
    if (!visited[i]) {
      const comp: number[] = [];
      const queue = [i];
      visited[i] = 1;
      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.push(curr);
        for (const nbr of adj[curr]) {
          if (!visited[nbr]) {
            visited[nbr] = 1;
            queue.push(nbr);
          }
        }
      }
      components.push(comp);
    }
  }

  // Sort components largest first
  components.sort((a, b) => b.length - a.length);

  // Ideal link length scaled by network size
  const idealEdgeLen = N > 150 ? 155 : N > 40 ? 175 : 210;
  const globalPositions: Point[] = Array.from({ length: N }, () => ({ x: 0, y: 0 }));

  // 2. Solve each connected component using Graph-Distance Stress Majorization (Cola style)
  const compBoxes: { nodes: number[]; width: number; height: number }[] = [];

  for (const comp of components) {
    const C = comp.length;
    if (C === 1) {
      globalPositions[comp[0]] = { x: 0, y: 0 };
      compBoxes.push({ nodes: comp, width: 160, height: 140 });
      continue;
    }

    const localIdxMap = new Map<number, number>();
    comp.forEach((gIdx, lIdx) => localIdxMap.set(gIdx, lIdx));

    // Compute BFS shortest-path hop distances between all pairs in this component
    const distMatrix: Uint16Array[] = Array.from({ length: C }, () => new Uint16Array(C));
    for (let s = 0; s < C; s++) {
      const dist = distMatrix[s];
      dist.fill(65535);
      dist[s] = 0;
      const q = [comp[s]];
      let head = 0;
      while (head < q.length) {
        const uGlobal = q[head++];
        const uLocal = localIdxMap.get(uGlobal)!;
        const dNext = dist[uLocal] + 1;
        for (const vGlobal of adj[uGlobal]) {
          const vLocal = localIdxMap.get(vGlobal);
          if (vLocal !== undefined && dist[vLocal] === 65535) {
            dist[vLocal] = dNext;
            q.push(vGlobal);
          }
        }
      }
    }

    // Seed initial positions using BFS radial layering from the highest-degree central hub
    let hubLocal = 0;
    let maxDeg = -1;
    for (let i = 0; i < C; i++) {
      const deg = adj[comp[i]].length;
      if (deg > maxDeg) {
        maxDeg = deg;
        hubLocal = i;
      }
    }

    const layers: number[][] = [];
    const placed = new Uint8Array(C);
    const bfsQ = [hubLocal];
    placed[hubLocal] = 1;
    const nodeLayer = new Int32Array(C);
    const parentAngle = new Float64Array(C);

    while (bfsQ.length > 0) {
      const lIdx = bfsQ.shift()!;
      const lyr = nodeLayer[lIdx];
      if (!layers[lyr]) layers[lyr] = [];
      layers[lyr].push(lIdx);

      for (const nbrGlobal of adj[comp[lIdx]]) {
        const nbrLocal = localIdxMap.get(nbrGlobal);
        if (nbrLocal !== undefined && !placed[nbrLocal]) {
          placed[nbrLocal] = 1;
          nodeLayer[nbrLocal] = lyr + 1;
          bfsQ.push(nbrLocal);
        }
      }
    }

    const localPos: Point[] = Array.from({ length: C }, () => ({ x: 0, y: 0 }));
    layers.forEach((layerNodes, lyrIdx) => {
      if (lyrIdx === 0) {
        localPos[layerNodes[0]] = { x: 0, y: 0 };
        return;
      }
      const r = lyrIdx * idealEdgeLen * 0.92;
      const count = layerNodes.length;
      layerNodes.forEach((lIdx, k) => {
        const angle = (2 * Math.PI * k) / count + (lyrIdx % 2) * 0.25;
        parentAngle[lIdx] = angle;
        localPos[lIdx] = {
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
        };
      });
    });

    // Iterative Stress Majorization (minimizes sum_{i<j} w_ij (||p_i - p_j|| - L * d_ij)^2)
    const iterations = C > 120 ? 85 : 130;
    const kHopLimit = C > 120 ? 5 : 12; // Local + medium-range neighborhood for large 132kV speed

    for (let iter = 0; iter < iterations; iter++) {
      const stepScale = 0.45 * (1 - iter / (iterations * 1.15));

      for (let i = 0; i < C; i++) {
        let sumWx = 0;
        let sumWy = 0;
        let sumW = 0;
        const rowDist = distMatrix[i];

        for (let j = 0; j < C; j++) {
          if (i === j) continue;
          const hops = rowDist[j];
          if (hops === 0 || hops > kHopLimit) continue;

          const targetDist = hops * idealEdgeLen;
          // Weight w_ij = 1 / hops^2 (stronger for direct neighbors, gentler for distant nodes)
          const w = hops === 1 ? 2.5 : 1.0 / (hops * hops);

          const dx = localPos[i].x - localPos[j].x;
          const dy = localPos[i].y - localPos[j].y;
          const actualDist = Math.hypot(dx, dy) || 0.1;

          // Target position of i relative to j
          const targetX = localPos[j].x + (dx / actualDist) * targetDist;
          const targetY = localPos[j].y + (dy / actualDist) * targetDist;

          sumWx += w * targetX;
          sumWy += w * targetY;
          sumW += w;
        }

        // Additional short-range repulsion against all nodes closer than idealEdgeLen * 0.85
        for (let j = 0; j < C; j++) {
          if (i === j) continue;
          const dx = localPos[i].x - localPos[j].x;
          const dy = localPos[i].y - localPos[j].y;
          const distSq = dx * dx + dy * dy;
          const minSep = idealEdgeLen * 0.82;
          if (distSq < minSep * minSep && distSq > 1e-2) {
            const d = Math.sqrt(distSq);
            const wRep = 3.0;
            sumWx += wRep * (localPos[j].x + (dx / d) * minSep);
            sumWy += wRep * (localPos[j].y + (dy / d) * minSep);
            sumW += wRep;
          }
        }

        if (sumW > 0) {
          const nextX = sumWx / sumW;
          const nextY = sumWy / sumW;
          localPos[i].x += (nextX - localPos[i].x) * stepScale;
          localPos[i].y += (nextY - localPos[i].y) * stepScale;
        }
      }
    }

    // 3. Node-to-Edge Clearance Pass (Prevents lines from slicing across unrelated busbars)
    const compEdges: [number, number][] = [];
    for (let i = 0; i < C; i++) {
      const uG = comp[i];
      for (const vG of adj[uG]) {
        const j = localIdxMap.get(vG);
        if (j !== undefined && i < j) {
          compEdges.push([i, j]);
        }
      }
    }

    const EDGE_CLEARANCE = 72;
    for (let pass = 0; pass < 18; pass++) {
      // A. Push nodes away from non-incident line segments
      for (const [u, v] of compEdges) {
        const ax = localPos[u].x;
        const ay = localPos[u].y;
        const bx = localPos[v].x;
        const by = localPos[v].y;
        const abx = bx - ax;
        const aby = by - ay;
        const abLenSq = abx * abx + aby * aby;
        if (abLenSq < 1) continue;

        for (let k = 0; k < C; k++) {
          if (k === u || k === v) continue;
          const px = localPos[k].x;
          const py = localPos[k].y;
          const t = ((px - ax) * abx + (py - ay) * aby) / abLenSq;
          if (t > 0.08 && t < 0.92) {
            const projX = ax + t * abx;
            const projY = ay + t * aby;
            let dx = px - projX;
            let dy = py - projY;
            const dist = Math.hypot(dx, dy);
            if (dist < EDGE_CLEARANCE) {
              if (dist < 1e-2) {
                dx = -aby;
                dy = abx;
              }
              const norm = Math.hypot(dx, dy) || 1;
              const push = (EDGE_CLEARANCE - dist) * 0.65;
              localPos[k].x += (dx / norm) * push;
              localPos[k].y += (dy / norm) * push;
              localPos[u].x -= (dx / norm) * push * 0.25;
              localPos[v].x -= (dx / norm) * push * 0.25;
            }
          }
        }
      }

      // B. Rectangular Non-Overlap Constraint (Busbar + Top Generator + Bottom Load box)
      const BOX_W = 148;
      const BOX_H = 122;
      for (let i = 0; i < C; i++) {
        for (let j = i + 1; j < C; j++) {
          const dx = localPos[j].x - localPos[i].x;
          const dy = localPos[j].y - localPos[i].y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (absDx < BOX_W && absDy < BOX_H) {
            const overlapX = BOX_W - absDx;
            const overlapY = BOX_H - absDy;
            if (overlapX < overlapY) {
              const shift = overlapX * 0.52;
              const sign = dx >= 0 ? 1 : -1;
              localPos[j].x += sign * shift;
              localPos[i].x -= sign * shift;
            } else {
              const shift = overlapY * 0.52;
              const sign = dy >= 0 ? 1 : -1;
              localPos[j].y += sign * shift;
              localPos[i].y -= sign * shift;
            }
          }
        }
      }
    }

    // Normalize component local coordinates to start at (0, 0)
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < C; i++) {
      minX = Math.min(minX, localPos[i].x);
      maxX = Math.max(maxX, localPos[i].x);
      minY = Math.min(minY, localPos[i].y);
      maxY = Math.max(maxY, localPos[i].y);
    }

    for (let i = 0; i < C; i++) {
      globalPositions[comp[i]] = {
        x: localPos[i].x - minX,
        y: localPos[i].y - minY,
      };
    }

    compBoxes.push({
      nodes: comp,
      width: Math.max(180, maxX - minX + 180),
      height: Math.max(150, maxY - minY + 160),
    });
  }

  // 4. Shelf Bin-Packing for Multiple Connected Components (Keeps 132kV sub-grids organized)
  const totalArea = compBoxes.reduce((acc, b) => acc + b.width * b.height, 0);
  const maxRowWidth = Math.max(
    compBoxes[0]?.width || 1200,
    Math.sqrt(totalArea) * 1.35
  );

  let cursorX = 100;
  let cursorY = 100;
  let rowHeight = 0;

  for (const box of compBoxes) {
    if (cursorX > 100 && cursorX + box.width > maxRowWidth) {
      cursorX = 100;
      cursorY += rowHeight + 120;
      rowHeight = 0;
    }

    for (const gIdx of box.nodes) {
      globalPositions[gIdx].x = Math.round(globalPositions[gIdx].x + cursorX);
      globalPositions[gIdx].y = Math.round(globalPositions[gIdx].y + cursorY);
    }

    cursorX += box.width + 110;
    rowHeight = Math.max(rowHeight, box.height);
  }

  const result: Record<number, Point> = {};
  buses.forEach((b, idx) => {
    result[b.id] = globalPositions[idx];
  });

  return result;
}

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = ({
  buses = [],
  lines = [],
  trippedLines = [],
  toggleLine,
  selectedBus,
  setSelectedBus,
  modelName,
}) => {
  const [viewStyle, setViewStyle] = useState<'stac_direct' | 'orthogonal'>('stac_direct');
  const [searchQuery, setSearchQuery] = useState('');

  // Canvas Viewport Pan & Zoom
  const [scale, setScale] = useState<number>(0.85);
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });

  // Persistent Draggable Busbar Coordinates
  const [busPositions, setBusPositions] = useState<Record<number, Point>>({});
  const busPositionsRef = useRef<Record<number, Point>>({});
  busPositionsRef.current = busPositions;

  // High-Precision Dragging State
  const [draggingBusId, setDraggingBusId] = useState<number | null>(null);
  const draggingBusIdRef = useRef<number | null>(null);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const hasDraggedRef = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const scaleRef = useRef<number>(scale);
  scaleRef.current = scale;
  const panRef = useRef<Point>(pan);
  panRef.current = pan;

  const handleAutoFit = useCallback(() => {
    const positions = Object.values(busPositionsRef.current);
    if (positions.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    positions.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const w = Math.max(400, maxX - minX + 260);
    const h = Math.max(350, maxY - minY + 260);
    const containerW = containerRef.current?.clientWidth || 1200;
    const containerH = containerRef.current?.clientHeight || 820;

    const fitScale = Math.min(containerW / w, containerH / h, 1.25);
    const newScale = Math.max(0.18, fitScale);
    const newPan = {
      x: (containerW - w * newScale) / 2 - minX * newScale + 130 * newScale,
      y: (containerH - h * newScale) / 2 - minY * newScale + 130 * newScale,
    };

    setScale(newScale);
    setPan(newPan);
    scaleRef.current = newScale;
    panRef.current = newPan;
  }, []);

  // Compute Layout ONLY when model changes or when new buses are added.
  // Opening/closing lines NEVER recalculates or shifts any node positions.
  const layoutVersionKey = `nesi_sld_v3_${modelName || 'default'}_${buses.length}`;
  useEffect(() => {
    if (!buses || buses.length === 0) return;

    // If all current buses already have positions in memory for this model, keep them locked
    if (
      Object.keys(busPositionsRef.current).length === buses.length &&
      buses.every((b) => busPositionsRef.current[b.id] !== undefined)
    ) {
      return;
    }

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(layoutVersionKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (buses.every((b) => parsed[b.id] !== undefined)) {
            setBusPositions(parsed);
            busPositionsRef.current = parsed;
            setTimeout(handleAutoFit, 50);
            return;
          }
        } catch {}
      }
    }

    const freshLayout = computeStacPlanarLayout(buses, lines);
    setBusPositions(freshLayout);
    busPositionsRef.current = freshLayout;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(layoutVersionKey, JSON.stringify(freshLayout));
      } catch {}
    }

    setTimeout(handleAutoFit, 60);
  }, [layoutVersionKey, buses.length, handleAutoFit]);

  // Smooth Wheel / Pinch Zoom Centered at Cursor
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
      const nextScale = Math.min(3.5, Math.max(0.15, currScale * zoomFactor));

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

  // Convert screen coordinates to world SVG coordinates using live refs (zero lag during drag)
  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / scaleRef.current,
      y: (clientY - rect.top - panRef.current.y) / scaleRef.current,
    };
  }, []);

  // Unified Canvas Pointer Tracking (Handles both fast node dragging & canvas panning smoothly)
  const handleBusPointerDown = (e: React.PointerEvent, busId: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (containerRef.current) {
      try {
        containerRef.current.setPointerCapture(e.pointerId);
      } catch {}
    }

    const mouseWorld = screenToWorld(e.clientX, e.clientY);
    const busPos = busPositionsRef.current[busId] || { x: 200, y: 200 };

    draggingBusIdRef.current = busId;
    setDraggingBusId(busId);
    hasDraggedRef.current = false;
    dragOffsetRef.current = {
      x: mouseWorld.x - busPos.x,
      y: mouseWorld.y - busPos.y,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (draggingBusIdRef.current !== null) return;

    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX - panRef.current.x,
      y: e.clientY - panRef.current.y,
    };
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    const activeBusId = draggingBusIdRef.current;
    if (activeBusId !== null) {
      hasDraggedRef.current = true;
      const mouseWorld = screenToWorld(e.clientX, e.clientY);
      const newPos = {
        x: mouseWorld.x - dragOffsetRef.current.x,
        y: mouseWorld.y - dragOffsetRef.current.y,
      };

      setBusPositions((prev) => {
        const next = { ...prev, [activeBusId]: newPos };
        busPositionsRef.current = next;
        return next;
      });
      return;
    }

    if (isPanning) {
      const nextPan = {
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      };
      setPan(nextPan);
      panRef.current = nextPan;
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (draggingBusIdRef.current !== null) {
      const finishedBusId = draggingBusIdRef.current;
      draggingBusIdRef.current = null;
      setDraggingBusId(null);

      try {
        containerRef.current?.releasePointerCapture(e.pointerId);
      } catch {}

      if (typeof window !== 'undefined' && finishedBusId !== null) {
        try {
          localStorage.setItem(layoutVersionKey, JSON.stringify(busPositionsRef.current));
        } catch {}
      }
    }

    if (isPanning) {
      setIsPanning(false);
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleResetLayout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(layoutVersionKey);
    }
    const fresh = computeStacPlanarLayout(buses, lines);
    setBusPositions(fresh);
    busPositionsRef.current = fresh;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(layoutVersionKey, JSON.stringify(fresh));
      } catch {}
    }
    setTimeout(handleAutoFit, 50);
  };

  const handleSearchSelect = (busId: number) => {
    const pos = busPositions[busId];
    if (pos && containerRef.current) {
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      const targetScale = Math.max(scaleRef.current, 0.95);
      const nextPan = {
        x: containerW / 2 - pos.x * targetScale,
        y: containerH / 2 - pos.y * targetScale,
      };
      setScale(targetScale);
      setPan(nextPan);
      scaleRef.current = targetScale;
      panRef.current = nextPan;
      const b = buses.find((item) => item.id === busId);
      if (b) setSelectedBus(b);
    }
  };

  const exportAsPNG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
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
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `NESI_SLD_${modelName || 'Grid'}.png`;
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
    a.download = `NESI_SLD_${modelName || 'Grid'}.svg`;
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

  // Group parallel lines between identical bus pairs (STAC MultiLineEdge)
  // Separates parallel lines by 20px perpendicular offset and staggers breaker boxes so they never overlap
  const multiLineMeta = useMemo(() => {
    const corridorMap = new Map<string, number[]>();
    lines.forEach((l) => {
      const key = l.from_bus < l.to_bus ? `${l.from_bus}_${l.to_bus}` : `${l.to_bus}_${l.from_bus}`;
      if (!corridorMap.has(key)) corridorMap.set(key, []);
      corridorMap.get(key)!.push(l.id);
    });

    const metaMap = new Map<number, { offset: number; tPos: number; count: number }>();
    corridorMap.forEach((lineIds) => {
      const count = lineIds.length;
      lineIds.forEach((id, idx) => {
        const offset = (idx - (count - 1) / 2) * 20;
        // Stagger breaker box position along parallel lines so boxes never collide
        const tPos = count === 1 ? 0.5 : 0.41 + (idx / Math.max(1, count - 1)) * 0.18;
        metaMap.set(id, { offset, tPos, count });
      });
    });
    return metaMap;
  }, [lines]);

  return (
    <div className="space-y-3 max-w-7xl mx-auto py-1">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-3">
        <div>
          <p className="text-xs text-slate-600 font-bold">
            {buses.length} Substations • {lines.length} Corridors
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
            <span>Reset</span>
          </button>

          {/* Line Style Toggle */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-2xs">
            <button
              onClick={() => setViewStyle('stac_direct')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                viewStyle === 'stac_direct'
                  ? 'bg-[#500b50] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Nig bus</span>
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

      {/* Main Canvas Area */}
      <div className="relative w-full">
        <div
          ref={containerRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          className={`h-[820px] w-full rounded-2xl border border-slate-300 bg-white relative overflow-hidden shadow-sm select-none touch-none ${
            draggingBusId !== null ? 'cursor-grabbing' : isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Vector SVG Canvas */}
          <svg ref={svgRef} className="w-full h-full" style={{ width: '100%', height: '100%' }}>
            <defs>
              <pattern id="stacCadGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.85" fill="#cbd5e1" opacity="0.8" />
              </pattern>
              <marker
                id="loadArrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#0f172a" />
              </marker>
            </defs>

            <rect
              x="-20000"
              y="-20000"
              width="50000"
              height="50000"
              fill="url(#stacCadGrid)"
              pointerEvents="none"
            />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* ========================================================================= */}
              {/* 1. TRANSMISSION LINES (Continuous Docking & Fixed Length on Open/Close)   */}
              {/* ========================================================================= */}
              {lines.map((line) => {
                const rawPosA = busPositions[line.from_bus];
                const rawPosB = busPositions[line.to_bus];
                if (!rawPosA || !rawPosB) return null;

                // Canonical orientation for parallel offset so lane direction never flips
                const canonicalFlip = line.from_bus > line.to_bus ? -1 : 1;
                const meta = multiLineMeta.get(line.id) || { offset: 0, tPos: 0.5, count: 1 };
                const signedOffset = meta.offset * canonicalFlip;

                const posA = getContinuousBusDockPoint(rawPosA, rawPosB, signedOffset);
                const posB = getContinuousBusDockPoint(rawPosB, rawPosA, -signedOffset);

                const isTripped = trippedLines.includes(line.id);
                const loadingPercent = line.loading_percent ?? 0;
                const isOverload = loadingPercent > 100;
                const lineColor = isTripped ? '#dc2626' : isOverload ? '#ea580c' : '#0f172a';
                const flow = line.flow_mw ?? line.p_mw ?? 0;

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const lineDist = Math.hypot(dx, dy);

                // Staggered position along the segment so parallel breaker boxes never overlap
                const tBox = meta.tPos;
                const boxX = posA.x + dx * tBox;
                const boxY = posA.y + dy * tBox;

                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                const textFlipped = angleDeg > 90 || angleDeg < -90;

                let pathData = '';
                if (viewStyle === 'orthogonal') {
                  const midY = (posA.y + posB.y) / 2;
                  pathData = `M ${posA.x} ${posA.y} L ${posA.x} ${midY} L ${posB.x} ${midY} L ${posB.x} ${posB.y}`;
                } else {
                  pathData = `M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`;
                }

                const showBreakerBox = lineDist >= 42;

                return (
                  <g
                    key={`line-${line.id}`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLine(line.id);
                    }}
                  >
                    {/* Wide transparent hit area for easy clicking */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="16" />

                    {/* Constant-width background underlay when tripped so visual length never changes */}
                    {isTripped && (
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#fecaca"
                        strokeWidth="2.5"
                        strokeLinecap="butt"
                      />
                    )}

                    {/* Primary Transmission Line Stroke (Exact same strokeWidth & endpoints whether open or closed) */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth="2.5"
                      strokeLinecap="butt"
                      strokeDasharray={isTripped ? '7 5' : undefined}
                    />

                    {/* Solid terminal anchor dots at both busbar dock points so ends never look detached */}
                    <circle cx={posA.x} cy={posA.y} r="2.2" fill={lineColor} />
                    <circle cx={posB.x} cy={posB.y} r="2.2" fill={lineColor} />

                    {/* Inline Breaker & MW Flow Box */}
                    {showBreakerBox && (
                      <g
                        transform={`translate(${
                          viewStyle === 'orthogonal' ? (posA.x + posB.x) / 2 : boxX
                        }, ${viewStyle === 'orthogonal' ? (posA.y + posB.y) / 2 : boxY}) rotate(${
                          viewStyle === 'orthogonal' ? 0 : angleDeg
                        })`}
                      >
                        <rect
                          x="-20"
                          y="-8"
                          width="40"
                          height="16"
                          rx="2.5"
                          fill={isTripped ? '#fef2f2' : '#ffffff'}
                          stroke={lineColor}
                          strokeWidth="1.6"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="900"
                          fill={isTripped ? '#dc2626' : isOverload ? '#c2410c' : '#0f172a'}
                          transform={
                            viewStyle !== 'orthogonal' && textFlipped ? 'rotate(180)' : undefined
                          }
                        >
                          {isTripped ? 'OPEN' : `${Math.abs(flow).toFixed(0)}M`}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* ========================================================================= */}
              {/* 2. FLAT RECTANGULAR BUSBARS WITH FIXED TOP (~) & BOTTOM (↓) DECORATORS    */}
              {/* ========================================================================= */}
              {buses.map((bus) => {
                const pos = busPositions[bus.id];
                if (!pos) return null;

                const isSelected = selectedBus?.id === bus.id;
                const isDragging = draggingBusId === bus.id;
                const vVal = bus.v_pu ?? 1.0;
                const isUnder = vVal < 0.95;
                const isOver = vVal > 1.05;
                const busBarFill = isUnder ? '#dc2626' : isOver ? '#d97706' : '#0f172a';

                const pVal = bus.p_mw ?? 0;
                const nameLower = (bus.name || '').toLowerCase();
                const isGen =
                  pVal < -5 ||
                  nameLower.includes('gs') ||
                  nameLower.includes('ps') ||
                  nameLower.includes('slack') ||
                  nameLower.includes('ipp') ||
                  nameLower.includes('gen');

                const hasLoad = !isGen && Math.abs(pVal) > 1;

                return (
                  <g
                    key={`bus-${bus.id}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onPointerDown={(e) => handleBusPointerDown(e, bus.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!hasDraggedRef.current) {
                        setSelectedBus(bus);
                      }
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    {/* Selection Highlight Halo */}
                    {isSelected && (
                      <rect
                        x="-46"
                        y="-12"
                        width="92"
                        height="24"
                        rx="5"
                        fill="#500b50"
                        fillOpacity="0.12"
                        stroke="#500b50"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                    )}

                    {/* =============================================================== */}
                    {/* STAC TOP DECORATOR: Generator (~) ALWAYS Pointing Straight UP   */}
                    {/* =============================================================== */}
                    {isGen && (
                      <g pointerEvents="none">
                        {/* Vertical stem from top of flat busbar (y = -4.5) to circle bottom (y = -17) */}
                        <line x1="0" y1="-4.5" x2="0" y2="-17" stroke="#0f172a" strokeWidth="2" />
                        {/* Generator Circle centered at (0, -28) */}
                        <circle
                          cx="0"
                          cy="-28"
                          r="11"
                          fill="#ffffff"
                          stroke="#0f172a"
                          strokeWidth="2"
                        />
                        {/* Upright AC Sine Wave (~) inside circle */}
                        <path
                          d="M -5.5 -28 Q -2.75 -33 0 -28 T 5.5 -28"
                          fill="none"
                          stroke="#0f172a"
                          strokeWidth="2"
                        />
                        {/* Generator Active Power MW above circle */}
                        <text
                          x="0"
                          y="-43"
                          textAnchor="middle"
                          fontSize="9"
                          fill="#0f172a"
                          fontFamily="monospace"
                          fontWeight="900"
                        >
                          {Math.abs(pVal).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* =============================================================== */}
                    {/* STAC BOTTOM DECORATOR: Load Arrow ALWAYS Pointing Straight DOWN */}
                    {/* =============================================================== */}
                    {hasLoad && (
                      <g pointerEvents="none">
                        {/* Vertical load feeder stem from bottom of voltage label (y = 20) to arrow tip (y = 38) */}
                        <line
                          x1="0"
                          y1="20"
                          x2="0"
                          y2="37"
                          stroke="#0f172a"
                          strokeWidth="2"
                          markerEnd="url(#loadArrow)"
                        />
                        {/* Load Demand MW below arrow tip */}
                        <text
                          x="0"
                          y="49"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="900"
                          fill="#1e293b"
                        >
                          {Math.abs(pVal).toFixed(0)} MW
                        </text>
                      </g>
                    )}

                    {/* =============================================================== */}
                    {/* SHARP FLAT RECTANGULAR BUSBAR (76px x 9px)                      */}
                    {/* =============================================================== */}
                    <rect
                      x={-BUS_HALF_W}
                      y={-BUS_HALF_H}
                      width={BUS_HALF_W * 2}
                      height={BUS_HALF_H * 2}
                      rx="2"
                      fill={busBarFill}
                      stroke="#000000"
                      strokeWidth={isDragging ? '2.2' : '1.4'}
                    />

                    {/* Substation Name Label (Placed above generator if gen exists, or directly above busbar) */}
                    <text
                      x="0"
                      y={isGen ? -54 : -10}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="sans-serif"
                      fontWeight="900"
                      fill="#0f172a"
                      letterSpacing="0.2px"
                      pointerEvents="none"
                    >
                      {bus.name}
                    </text>

                    {/* Bus Voltage Magnitude Reading (Directly below busbar at y = 16) */}
                    <text
                      x="0"
                      y="16"
                      textAnchor="middle"
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="900"
                      fill={isUnder ? '#dc2626' : isOver ? '#d97706' : '#15803d'}
                      pointerEvents="none"
                    >
                      {vVal.toFixed(3)} pu
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* STAC Technical Property Inspector */}
          {selectedBus && (
            <div className="absolute top-4 right-4 z-20 w-80 rounded-2xl border border-slate-300 bg-white/95 backdrop-blur-md shadow-2xl p-4 text-xs font-sans">
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