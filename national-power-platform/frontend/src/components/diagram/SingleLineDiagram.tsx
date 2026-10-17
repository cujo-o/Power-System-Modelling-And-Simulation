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
  Layers,
  X,
  Compass,
  Power,
  Zap,
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
 * Continuous Ray-Rectangle Intersection.
 * Docks transmission line endpoints smoothly to the exact border of the 76x9 flat busbar.
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

  const originX = sourceCenter.x + nx * laneOffset * 0.85;
  const originY = sourceCenter.y + ny * laneOffset * 0.35;

  const tx = Math.abs(ux) > 1e-5 ? halfW / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-5 ? halfH / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);

  return {
    x: originX + ux * t,
    y: originY + uy * t,
  };
}

/**
 * Geographic + Topological Anchor Hints for Nigerian 330kV & 132kV Substations.
 * Normalized in [0..1, 0..1] (West->East, North->South) so Nigerian networks
 * naturally untangle along their real physical corridors.
 */
const NIGERIA_GEO_HINTS: Array<{ pattern: RegExp; x: number; y: number }> = [
  { pattern: /birnin|kebbi|sokoto|talata/i, x: 0.12, y: 0.14 },
  { pattern: /kainji/i, x: 0.22, y: 0.32 },
  { pattern: /jebba/i, x: 0.26, y: 0.42 },
  { pattern: /ganmo|ilorin|omupo/i, x: 0.26, y: 0.54 },
  { pattern: /oshogbo|osogbo|ife|ilesha/i, x: 0.25, y: 0.64 },
  { pattern: /ayede|ibadan|jericho/i, x: 0.19, y: 0.70 },
  { pattern: /olorunsogo|papalanto|abeokuta/i, x: 0.14, y: 0.76 },
  { pattern: /ikeja|akangba|egbin|lekki|aja|lagos|agbara|oworonsoki/i, x: 0.12, y: 0.86 },
  { pattern: /omotosho|ond/i, x: 0.28, y: 0.78 },
  { pattern: /benin|ihovbor|azura|oluku/i, x: 0.38, y: 0.78 },
  { pattern: /sapele|delta|ughelli|warri|effurun/i, x: 0.40, y: 0.88 },
  { pattern: /katsina|funtua|kankia/i, x: 0.44, y: 0.12 },
  { pattern: /kano|kumbotso|dakata|wudil|dan.?agundi/i, x: 0.52, y: 0.16 },
  { pattern: /kaduna|zaria|mando|jaji/i, x: 0.46, y: 0.28 },
  { pattern: /shiroro|zungeru|minna|bida|suleja|tegina/i, x: 0.40, y: 0.38 },
  { pattern: /katampe|gwagwa|abuja|apo|central.?area|kubwa|karu/i, x: 0.48, y: 0.46 },
  { pattern: /lokoja|ajaokuta|geregu|obajana|okene/i, x: 0.47, y: 0.64 },
  { pattern: /jos|makeri|pankshin/i, x: 0.60, y: 0.34 },
  { pattern: /lafia|akwanga|keffi/i, x: 0.57, y: 0.48 },
  { pattern: /makurdi|oko|gboko|otukpo|yandev/i, x: 0.62, y: 0.60 },
  { pattern: /bauchi|ningi/i, x: 0.68, y: 0.28 },
  { pattern: /gombe|ashaka|dadinkowa|biu/i, x: 0.78, y: 0.30 },
  { pattern: /damaturu|potiskum/i, x: 0.84, y: 0.20 },
  { pattern: /maiduguri|molai/i, x: 0.92, y: 0.16 },
  { pattern: /yola|mayo|jalingo|numan/i, x: 0.88, y: 0.42 },
  { pattern: /onitsha|okpai|asaba|nnewi|awka/i, x: 0.52, y: 0.78 },
  { pattern: /new.?haven|enugu|nsukka|abakaliki|nnkalagu/i, x: 0.60, y: 0.72 },
  { pattern: /alaoji|aba|owerri|umuahia|omoku/i, x: 0.58, y: 0.86 },
  { pattern: /afam|port.?harcourt|ph.?main|trans.?amadi|yenagoa|ahoada/i, x: 0.52, y: 0.92 },
  { pattern: /ikot.?ekpene|uyo|ekim|itu/i, x: 0.67, y: 0.88 },
  { pattern: /calabar|adiabo|ikom|ogoja/i, x: 0.76, y: 0.84 },
];

function getGeoSeed(name: string, index: number, total: number): { x: number; y: number } | null {
  for (const h of NIGERIA_GEO_HINTS) {
    if (h.pattern.test(name)) {
      // Deterministic micro-offset based on index so multiple buses in the same city don't stack on (0,0)
      const angle = (index * 2.39996) % (2 * Math.PI);
      const r = 0.018 * ((index % 5) + 1);
      return {
        x: h.x + Math.cos(angle) * r,
        y: h.y + Math.sin(angle) * r,
      };
    }
  }
  return null;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const ccw = (p1: Point, p2: Point, p3: Point) =>
    (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

/**
 * Hybrid Geographic + Force-Directed Anti-Crossing Layout Engine.
 */
function solveCleanGridLayout(buses: BusData[], lines: LineData[]): Record<number, Point> {
  const N = buses.length;
  if (N === 0) return {};

  const idToIdx = new Map<number, number>();
  buses.forEach((b, i) => idToIdx.set(b.id, i));

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

  // Canvas target area scaled to number of buses in a wide 16:10 aspect ratio
  const idealSpacing = N <= 10 ? 220 : N <= 80 ? 185 : 155;
  const worldW = Math.max(950, Math.sqrt(N) * idealSpacing * 1.45);
  const worldH = Math.max(680, Math.sqrt(N) * idealSpacing * 1.05);

  const pos: Point[] = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
  const hasGeo = new Uint8Array(N);

  // 1. Seed buses with Nigerian Geographic Hints where recognized
  let geoCount = 0;
  buses.forEach((b, i) => {
    const g = getGeoSeed(b.name || '', i, N);
    if (g) {
      pos[i] = {
        x: 120 + g.x * (worldW - 240),
        y: 120 + g.y * (worldH - 240),
      };
      hasGeo[i] = 1;
      geoCount++;
    }
  });

  // 2. For buses without geographic match, seed via BFS from anchored neighbors or circular/grid order
  if (geoCount > 0 && geoCount < N) {
    // Iterative barycentric interpolation from anchored neighbors
    for (let pass = 0; pass < 12; pass++) {
      for (let i = 0; i < N; i++) {
        if (hasGeo[i]) continue;
        const anchoredNbrs = adj[i].filter((nb) => hasGeo[nb]);
        if (anchoredNbrs.length > 0) {
          let sx = 0;
          let sy = 0;
          anchoredNbrs.forEach((nb) => {
            sx += pos[nb].x;
            sy += pos[nb].y;
          });
          const angle = ((i * 137.5) * Math.PI) / 180;
          pos[i] = {
            x: sx / anchoredNbrs.length + Math.cos(angle) * (idealSpacing * 0.7),
            y: sy / anchoredNbrs.length + Math.sin(angle) * (idealSpacing * 0.7),
          };
          hasGeo[i] = 2; // soft-anchored
        }
      }
    }
  }

  // Any remaining unplaced nodes get a clean topological BFS grid/circle seed
  const unplaced: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!hasGeo[i]) unplaced.push(i);
  }

  if (unplaced.length > 0) {
    const cols = Math.ceil(Math.sqrt(unplaced.length * 1.4));
    unplaced.forEach((uIdx, k) => {
      if (N <= 15) {
        const theta = (2 * Math.PI * k) / unplaced.length - Math.PI / 2;
        pos[uIdx] = {
          x: worldW / 2 + Math.cos(theta) * (idealSpacing * 1.15),
          y: worldH / 2 + Math.sin(theta) * (idealSpacing * 0.95),
        };
      } else {
        const col = k % cols;
        const row = Math.floor(k / cols);
        pos[uIdx] = {
          x: 140 + col * idealSpacing,
          y: 140 + row * (idealSpacing * 0.85),
        };
      }
    });
  }

  // Save initial anchor targets for geo-matched nodes so they stay in their true region
  const geoAnchor: Point[] = pos.map((p) => ({ x: p.x, y: p.y }));

  // 3. Force-Directed Untangling + Edge-Crossing Reduction + Node-Edge Repulsion
  const iterations = N > 150 ? 90 : 140;
  const kSq = idealSpacing * idealSpacing;

  for (let it = 0; it < iterations; it++) {
    const progress = it / iterations;
    const temp = idealSpacing * 0.45 * (1 - progress * 0.85);
    const disp: Point[] = Array.from({ length: N }, () => ({ x: 0, y: 0 }));

    // A. Node-to-Node Repulsion (Spatial cutoff for fast 369-bus performance)
    const repCutoff = idealSpacing * 2.8;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        if (Math.abs(dx) > repCutoff || Math.abs(dy) > repCutoff) continue;

        // Anisotropic distance: horizontal busbars need wider X separation than Y
        const dist = Math.hypot(dx, dy * 1.25) || 0.5;
        if (dist < repCutoff) {
          const force = (kSq / (dist * dist)) * idealSpacing * 0.55;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          disp[i].x += fx;
          disp[i].y += fy;
          disp[j].x -= fx;
          disp[j].y -= fy;
        }
      }
    }

    // B. Spring Attraction along Transmission Corridors
    for (const [u, v] of edges) {
      const dx = pos[v].x - pos[u].x;
      const dy = pos[v].y - pos[u].y;
      const dist = Math.hypot(dx, dy) || 1;
      const delta = dist - idealSpacing * 0.88;
      const force = delta * 0.18;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[u].x += fx;
      disp[u].y += fy;
      disp[v].x -= fx;
      disp[v].y -= fy;
    }

    // C. Soft Geographic Anchor Pull (keeps North in North, Lagos in South-West, etc.)
    for (let i = 0; i < N; i++) {
      if (hasGeo[i] === 1) {
        disp[i].x += (geoAnchor[i].x - pos[i].x) * 0.12;
        disp[i].y += (geoAnchor[i].y - pos[i].y) * 0.12;
      }
    }

    // D. Edge-to-Edge Uncrossing Force (for models up to 140 lines)
    if (edges.length <= 160 && it % 2 === 0) {
      for (let i = 0; i < edges.length; i++) {
        const [u1, v1] = edges[i];
        for (let j = i + 1; j < edges.length; j++) {
          const [u2, v2] = edges[j];
          if (u1 === u2 || u1 === v2 || v1 === u2 || v1 === v2) continue;
          if (segmentsCross(pos[u1], pos[v1], pos[u2], pos[v2])) {
            // Pull endpoints toward uncrossing
            const mid1x = (pos[u1].x + pos[v1].x) * 0.5;
            const mid1y = (pos[u1].y + pos[v1].y) * 0.5;
            const mid2x = (pos[u2].x + pos[v2].x) * 0.5;
            const mid2y = (pos[u2].y + pos[v2].y) * 0.5;
            const cdx = mid1x - mid2x;
            const cdy = mid1y - mid2y;
            const clen = Math.hypot(cdx, cdy) || 1;
            const push = 18;
            disp[u1].x += (cdx / clen) * push;
            disp[u1].y += (cdy / clen) * push;
            disp[v1].x += (cdx / clen) * push;
            disp[v1].y += (cdy / clen) * push;
            disp[u2].x -= (cdx / clen) * push;
            disp[u2].y -= (cdy / clen) * push;
            disp[v2].x -= (cdx / clen) * push;
            disp[v2].y -= (cdy / clen) * push;
          }
        }
      }
    }

    // E. Node-to-Line Segment Clearance (Prevents lines from passing through unrelated busbars)
    if (it > iterations * 0.35) {
      const CLEAR_DIST = 68;
      for (const [u, v] of edges) {
        const ax = pos[u].x;
        const ay = pos[u].y;
        const bx = pos[v].x;
        const by = pos[v].y;
        const abx = bx - ax;
        const aby = by - ay;
        const abSq = abx * abx + aby * aby;
        if (abSq < 1) continue;

        const minBx = Math.min(ax, bx) - CLEAR_DIST;
        const maxBx = Math.max(ax, bx) + CLEAR_DIST;
        const minBy = Math.min(ay, by) - CLEAR_DIST;
        const maxBy = Math.max(ay, by) + CLEAR_DIST;

        for (let k = 0; k < N; k++) {
          if (k === u || k === v) continue;
          const px = pos[k].x;
          const py = pos[k].y;
          if (px < minBx || px > maxBx || py < minBy || py > maxBy) continue;

          const t = ((px - ax) * abx + (py - ay) * aby) / abSq;
          if (t > 0.08 && t < 0.92) {
            const projX = ax + t * abx;
            const projY = ay + t * aby;
            let dx = px - projX;
            let dy = py - projY;
            const d = Math.hypot(dx, dy);
            if (d < CLEAR_DIST) {
              if (d < 1e-2) {
                dx = -aby;
                dy = abx;
              }
              const norm = Math.hypot(dx, dy) || 1;
              const push = (CLEAR_DIST - d) * 0.9;
              disp[k].x += (dx / norm) * push;
              disp[k].y += (dy / norm) * push;
            }
          }
        }
      }
    }

    // Apply displacements with temperature cap
    for (let i = 0; i < N; i++) {
      const dLen = Math.hypot(disp[i].x, disp[i].y) || 1;
      const step = Math.min(dLen, temp);
      pos[i].x += (disp[i].x / dLen) * step;
      pos[i].y += (disp[i].y / dLen) * step;
    }
  }

  // 4. Compact Connected-Component Packing (Eliminates huge empty gaps in 369-bus 132kV models)
  const visited = new Uint8Array(N);
  const comps: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (!visited[i]) {
      const c: number[] = [];
      const q = [i];
      visited[i] = 1;
      while (q.length > 0) {
        const curr = q.shift()!;
        c.push(curr);
        for (const nb of adj[curr]) {
          if (!visited[nb]) {
            visited[nb] = 1;
            q.push(nb);
          }
        }
      }
      comps.push(c);
    }
  }

  if (comps.length > 1) {
    comps.sort((a, b) => b.length - a.length);
    const boxes = comps.map((c) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      c.forEach((idx) => {
        minX = Math.min(minX, pos[idx].x);
        maxX = Math.max(maxX, pos[idx].x);
        minY = Math.min(minY, pos[idx].y);
        maxY = Math.max(maxY, pos[idx].y);
      });
      c.forEach((idx) => {
        pos[idx].x -= minX;
        pos[idx].y -= minY;
      });
      return {
        nodes: c,
        w: Math.max(150, maxX - minX + 140),
        h: Math.max(130, maxY - minY + 130),
      };
    });

    const totalArea = boxes.reduce((acc, b) => acc + b.w * b.h, 0);
    const targetWidth = Math.max(boxes[0].w, Math.sqrt(totalArea) * 1.55);

    let cx = 80;
    let cy = 80;
    let rowH = 0;

    boxes.forEach((box) => {
      if (cx > 80 && cx + box.w > targetWidth) {
        cx = 80;
        cy += rowH + 65;
        rowH = 0;
      }
      box.nodes.forEach((idx) => {
        pos[idx].x += cx;
        pos[idx].y += cy;
      });
      cx += box.w + 65;
      rowH = Math.max(rowH, box.h);
    });
  }

  // 5. Final Hard Bounding-Box Separation Pass (Guarantees zero overlapping busbars or labels)
  const MIN_W = 142;
  const MIN_H = 116;
  for (let pass = 0; pass < 25; pass++) {
    let moved = false;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < MIN_W && absDy < MIN_H) {
          moved = true;
          const overlapX = MIN_W - absDx;
          const overlapY = MIN_H - absDy;
          if (overlapX < overlapY) {
            const push = overlapX * 0.52 + 1;
            const sign = dx >= 0 ? 1 : -1;
            pos[j].x += sign * push;
            pos[i].x -= sign * push;
          } else {
            const push = overlapY * 0.52 + 1;
            const sign = dy >= 0 ? 1 : -1;
            pos[j].y += sign * push;
            pos[i].y -= sign * push;
          }
        }
      }
    }
    if (!moved) break;
  }

  const finalMap: Record<number, Point> = {};
  buses.forEach((b, i) => {
    finalMap[b.id] = {
      x: Math.round(pos[i].x),
      y: Math.round(pos[i].y),
    };
  });

  return finalMap;
}

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = ({
  buses = [],
  lines = [],
  trippedLines = [],
  toggleLine,
  selectedBus: propSelectedBus,
  setSelectedBus: propSetSelectedBus,
  modelName,
}) => {
  const [viewStyle, setViewStyle] = useState<'stac_direct' | 'orthogonal'>('stac_direct');
  const [searchQuery, setSearchQuery] = useState('');

  // Internal + Prop synced Bus & Line Selection state so tapping ALWAYS opens the inspector
  const [internalSelectedBusId, setInternalSelectedBusId] = useState<number | null>(
    propSelectedBus?.id ?? null
  );
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);

  useEffect(() => {
    if (propSelectedBus !== undefined) {
      setInternalSelectedBusId(propSelectedBus ? propSelectedBus.id : null);
    }
  }, [propSelectedBus]);

  const activeSelectedBus = useMemo(() => {
    if (internalSelectedBusId === null) return null;
    return buses.find((b) => b.id === internalSelectedBusId) || null;
  }, [buses, internalSelectedBusId]);

  const activeSelectedLine = useMemo(() => {
    if (selectedLineId === null) return null;
    return lines.find((l) => l.id === selectedLineId) || null;
  }, [lines, selectedLineId]);

  const handleSelectBus = useCallback(
    (bus: BusData | null) => {
      setInternalSelectedBusId(bus ? bus.id : null);
      if (bus) setSelectedLineId(null);
      if (propSetSelectedBus) propSetSelectedBus(bus);
    },
    [propSetSelectedBus]
  );

  // Canvas Viewport Pan & Zoom
  const [scale, setScale] = useState<number>(0.85);
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 });
  const [isPanning, setIsPanning] = useState<boolean>(false);

  // Persistent Draggable Busbar Coordinates
  const [busPositions, setBusPositions] = useState<Record<number, Point>>({});
  const busPositionsRef = useRef<Record<number, Point>>({});
  busPositionsRef.current = busPositions;

  // Dragging Interaction Refs (5px threshold so taps are never mistaken for drags)
  const [draggingBusId, setDraggingBusId] = useState<number | null>(null);
  const pointerDownInfoRef = useRef<{
    type: 'bus' | 'canvas';
    busId?: number;
    pointerId: number;
    startX: number;
    startY: number;
    worldOffsetX: number;
    worldOffsetY: number;
    panStartX: number;
    panStartY: number;
    isDraggingNow: boolean;
  } | null>(null);

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

    const w = Math.max(400, maxX - minX + 240);
    const h = Math.max(350, maxY - minY + 240);
    const containerW = containerRef.current?.clientWidth || 1200;
    const containerH = containerRef.current?.clientHeight || 820;

    const fitScale = Math.min(containerW / w, containerH / h, 1.25);
    const newScale = Math.max(0.22, fitScale);
    const newPan = {
      x: (containerW - w * newScale) / 2 - minX * newScale + 120 * newScale,
      y: (containerH - h * newScale) / 2 - minY * newScale + 120 * newScale,
    };

    setScale(newScale);
    setPan(newPan);
    scaleRef.current = newScale;
    panRef.current = newPan;
  }, []);

  // Compute Layout ONLY when model or bus count changes (Never on breaker toggle)
  const layoutVersionKey = `nesi_sld_v4_${modelName || 'default'}_${buses.length}`;
  useEffect(() => {
    if (!buses || buses.length === 0) return;

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

    const freshLayout = solveCleanGridLayout(buses, lines);
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

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / scaleRef.current,
      y: (clientY - rect.top - panRef.current.y) / scaleRef.current,
    };
  }, []);

  // Bus Pointer Down (Does NOT capture pointer until >5px drag movement, so taps always work!)
  const handleBusPointerDown = (e: React.PointerEvent, busId: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const mouseWorld = screenToWorld(e.clientX, e.clientY);
    const busPos = busPositionsRef.current[busId] || { x: 200, y: 200 };

    pointerDownInfoRef.current = {
      type: 'bus',
      busId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      worldOffsetX: mouseWorld.x - busPos.x,
      worldOffsetY: mouseWorld.y - busPos.y,
      panStartX: 0,
      panStartY: 0,
      isDraggingNow: false,
    };
  };

  // Canvas Background Pointer Down
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    pointerDownInfoRef.current = {
      type: 'canvas',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      worldOffsetX: 0,
      worldOffsetY: 0,
      panStartX: e.clientX - panRef.current.x,
      panStartY: e.clientY - panRef.current.y,
      isDraggingNow: false,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    const info = pointerDownInfoRef.current;
    if (!info) return;

    const moveDist = Math.hypot(e.clientX - info.startX, e.clientY - info.startY);

    // Only enter drag/pan mode once pointer moves past 5px threshold
    if (!info.isDraggingNow) {
      if (moveDist < 5) return;
      info.isDraggingNow = true;
      try {
        containerRef.current?.setPointerCapture(info.pointerId);
      } catch {}

      if (info.type === 'bus' && info.busId !== undefined) {
        setDraggingBusId(info.busId);
      } else {
        setIsPanning(true);
      }
    }

    if (info.type === 'bus' && info.busId !== undefined) {
      const busId = info.busId;
      const mouseWorld = screenToWorld(e.clientX, e.clientY);
      const newPos = {
        x: Math.round(mouseWorld.x - info.worldOffsetX),
        y: Math.round(mouseWorld.y - info.worldOffsetY),
      };

      setBusPositions((prev) => {
        const next = { ...prev, [busId]: newPos };
        busPositionsRef.current = next;
        return next;
      });
    } else if (info.type === 'canvas') {
      const nextPan = {
        x: e.clientX - info.panStartX,
        y: e.clientY - info.panStartY,
      };
      setPan(nextPan);
      panRef.current = nextPan;
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    const info = pointerDownInfoRef.current;
    if (!info) return;
    pointerDownInfoRef.current = null;

    if (info.isDraggingNow) {
      try {
        containerRef.current?.releasePointerCapture(info.pointerId);
      } catch {}

      if (info.type === 'bus' && typeof window !== 'undefined') {
        try {
          localStorage.setItem(layoutVersionKey, JSON.stringify(busPositionsRef.current));
        } catch {}
      }
      setDraggingBusId(null);
      setIsPanning(false);
    } else {
      // It was a clean tap (< 5px movement)!
      if (info.type === 'bus' && info.busId !== undefined) {
        const tappedBus = buses.find((b) => b.id === info.busId) || null;
        handleSelectBus(tappedBus);
      }
    }
  };

  const handleResetLayout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(layoutVersionKey);
    }
    const fresh = solveCleanGridLayout(buses, lines);
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
      if (b) handleSelectBus(b);
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

  // Group parallel lines between identical bus pairs
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
        const tPos = count === 1 ? 0.5 : 0.38 + (idx / Math.max(1, count - 1)) * 0.24;
        metaMap.set(id, { offset, tPos, count });
      });
    });
    return metaMap;
  }, [lines]);

  return (
    <div className="space-y-3 max-w-7xl mx-auto py-1">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-700 font-bold">
            {buses.length} Substations • {lines.length} Corridors
          </p>
          {trippedLines.length > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
              {trippedLines.length} Line(s) Shut Down (N-1)
            </span>
          )}
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
          <div className="absolute bottom-3 left-4 z-10 pointer-events-none text-[11px] font-mono text-slate-500 bg-white/85 px-2.5 py-1 rounded-md border border-slate-200">
            Tap any Busbar to inspect voltage &amp; corridors • Tap any Line or Breaker Box to Shut Down / Restore
          </div>

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
              {/* 1. TRANSMISSION LINES & INTERACTIVE CIRCUIT BREAKERS                      */}
              {/* ========================================================================= */}
              {lines.map((line) => {
                const rawPosA = busPositions[line.from_bus];
                const rawPosB = busPositions[line.to_bus];
                if (!rawPosA || !rawPosB) return null;

                const canonicalFlip = line.from_bus > line.to_bus ? -1 : 1;
                const meta = multiLineMeta.get(line.id) || { offset: 0, tPos: 0.5, count: 1 };
                const signedOffset = meta.offset * canonicalFlip;

                const posA = getContinuousBusDockPoint(rawPosA, rawPosB, signedOffset);
                const posB = getContinuousBusDockPoint(rawPosB, rawPosA, -signedOffset);

                const isTripped = trippedLines.includes(line.id);
                const isSelectedLine = selectedLineId === line.id;
                const loadingPercent = line.loading_percent ?? 0;
                const isOverload = loadingPercent > 100;
                const lineColor = isTripped
                  ? '#dc2626'
                  : isSelectedLine
                  ? '#500b50'
                  : isOverload
                  ? '#ea580c'
                  : '#0f172a';
                const flow = line.flow_mw ?? line.p_mw ?? 0;

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const lineDist = Math.hypot(dx, dy);

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

                const showBreakerBox = lineDist >= 38;

                return (
                  <g
                    key={`line-${line.id}`}
                    className="cursor-pointer group"
                    onPointerDown={(e) => {
                      // Stop canvas pan capture so clicking a line always fires cleanly
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLineId(line.id);
                      toggleLine(line.id);
                    }}
                  >
                    {/* Wide 18px transparent click target along the entire corridor */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="18" />

                    {/* Constant-width background underlay when tripped so visual length never changes */}
                    {isTripped && (
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#fecaca"
                        strokeWidth="2.6"
                        strokeLinecap="butt"
                      />
                    )}

                    {/* Primary Transmission Line Stroke */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={isSelectedLine ? '3.4' : '2.5'}
                      strokeLinecap="butt"
                      strokeDasharray={isTripped ? '7 5' : undefined}
                    />

                    {/* Terminal anchor dots at both busbar dock points */}
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
                          x="-21"
                          y="-8.5"
                          width="42"
                          height="17"
                          rx="3"
                          fill={isTripped ? '#dc2626' : '#ffffff'}
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
                          fill={isTripped ? '#ffffff' : isOverload ? '#c2410c' : '#0f172a'}
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

                const isSelected = activeSelectedBus?.id === bus.id;
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
                    className="cursor-pointer"
                  >
                    {/* Invisible enlarged hit box so tapping a busbar is effortless */}
                    <rect
                      x={-BUS_HALF_W - 8}
                      y={-BUS_HALF_H - 12}
                      width={(BUS_HALF_W + 8) * 2}
                      height={(BUS_HALF_H + 12) * 2}
                      fill="transparent"
                    />

                    {/* Selection Highlight Halo */}
                    {isSelected && (
                      <rect
                        x="-46"
                        y="-12"
                        width="92"
                        height="24"
                        rx="5"
                        fill="#500b50"
                        fillOpacity="0.16"
                        stroke="#500b50"
                        strokeWidth="2.2"
                        strokeDasharray="4 2"
                      />
                    )}

                    {/* STAC TOP DECORATOR: Generator (~) ALWAYS Pointing Straight UP */}
                    {isGen && (
                      <g pointerEvents="none">
                        <line x1="0" y1="-4.5" x2="0" y2="-17" stroke="#0f172a" strokeWidth="2" />
                        <circle
                          cx="0"
                          cy="-28"
                          r="11"
                          fill="#ffffff"
                          stroke="#0f172a"
                          strokeWidth="2"
                        />
                        <path
                          d="M -5.5 -28 Q -2.75 -33 0 -28 T 5.5 -28"
                          fill="none"
                          stroke="#0f172a"
                          strokeWidth="2"
                        />
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

                    {/* STAC BOTTOM DECORATOR: Load Arrow ALWAYS Pointing Straight DOWN */}
                    {hasLoad && (
                      <g pointerEvents="none">
                        <line
                          x1="0"
                          y1="20"
                          x2="0"
                          y2="37"
                          stroke="#0f172a"
                          strokeWidth="2"
                          markerEnd="url(#loadArrow)"
                        />
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

                    {/* SHARP FLAT RECTANGULAR BUSBAR (76px x 9px) */}
                    <rect
                      x={-BUS_HALF_W}
                      y={-BUS_HALF_H}
                      width={BUS_HALF_W * 2}
                      height={BUS_HALF_H * 2}
                      rx="2"
                      fill={busBarFill}
                      stroke={isSelected ? '#500b50' : '#000000'}
                      strokeWidth={isDragging || isSelected ? '2.2' : '1.4'}
                    />

                    {/* Substation Name Label */}
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

                    {/* Bus Voltage Magnitude Reading */}
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

          {/* ========================================================================= */}
          {/* 3. SELECTED LINE BREAKER QUICK CONTROL CARD                               */}
          {/* ========================================================================= */}
          {activeSelectedLine && !activeSelectedBus && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-4 right-4 z-20 w-80 rounded-2xl border border-slate-300 bg-white/95 backdrop-blur-md shadow-2xl p-4 text-xs font-sans"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <Power
                    className={`h-4 w-4 shrink-0 ${
                      trippedLines.includes(activeSelectedLine.id)
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    }`}
                  />
                  <span className="font-black text-slate-900 text-sm truncate">
                    {activeSelectedLine.name || `Line #${activeSelectedLine.id}`}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedLineId(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Circuit Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      trippedLines.includes(activeSelectedLine.id)
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {trippedLines.includes(activeSelectedLine.id)
                      ? 'SHUT DOWN (BREAKER OPEN)'
                      : 'IN SERVICE (CLOSED)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Interconnection:</span>
                  <span className="font-mono font-bold text-slate-800">
                    Bus #{activeSelectedLine.from_bus} → Bus #{activeSelectedLine.to_bus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Active Power Flow:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {trippedLines.includes(activeSelectedLine.id)
                      ? '0.0 MW'
                      : `${(activeSelectedLine.flow_mw ?? activeSelectedLine.p_mw ?? 0).toFixed(1)} MW`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Thermal Loading:</span>
                  <span className="font-mono font-bold text-[#500b50]">
                    {trippedLines.includes(activeSelectedLine.id)
                      ? '0.0%'
                      : `${(activeSelectedLine.loading_percent ?? 0).toFixed(1)}%`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => toggleLine(activeSelectedLine.id)}
                className={`mt-4 w-full py-2.5 rounded-xl font-bold text-xs text-white transition flex items-center justify-center gap-2 shadow-xs ${
                  trippedLines.includes(activeSelectedLine.id)
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                <Power className="h-4 w-4" />
                <span>
                  {trippedLines.includes(activeSelectedLine.id)
                    ? 'Close Breaker (Restore Line)'
                    : 'Shut Down Line (Trip Breaker)'}
                </span>
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. SUBSTATION BUS TECHNICAL PROPERTY INSPECTOR & LINE BREAKER DRAWER      */}
          {/* ========================================================================= */}
          {activeSelectedBus && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-4 right-4 z-20 w-80 rounded-2xl border border-slate-300 bg-white/95 backdrop-blur-md shadow-2xl p-4 text-xs font-sans"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#500b50]" />
                  <span className="font-black text-slate-900 text-sm">
                    Bus #{activeSelectedBus.id} ({activeSelectedBus.name})
                  </span>
                </div>
                <button
                  onClick={() => handleSelectBus(null)}
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
                        Substation Topology
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Bus ID</td>
                      <td className="py-1 px-2.5 font-mono font-bold">#{activeSelectedBus.id}</td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Grid Zone</td>
                      <td className="py-1 px-2.5 font-semibold">
                        {activeSelectedBus.zone || 'Bulk Transmission'}
                      </td>
                      <td className="py-1 px-2.5 text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Nominal kV</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {activeSelectedBus.vn_kv || 330.0}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">kV</td>
                    </tr>

                    <tr className="bg-slate-50/70 font-bold text-slate-500 text-[10px]">
                      <td colSpan={3} className="py-1 px-2.5 uppercase tracking-wider">
                        Steady-State Telemetry
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Voltage (|V|)</td>
                      <td className="py-1 px-2.5 font-mono font-black text-[#500b50]">
                        {(activeSelectedBus.v_pu ?? 1.0).toFixed(4)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">p.u.</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Line-to-Line</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(
                          (activeSelectedBus.v_pu ?? 1.0) * (activeSelectedBus.vn_kv || 330.0)
                        ).toFixed(1)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">kV</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Phase Angle</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(activeSelectedBus.va_deg ?? 0.0).toFixed(2)}°
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">deg</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Active Power</td>
                      <td className="py-1 px-2.5 font-mono font-black">
                        {(activeSelectedBus.p_mw ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MW</td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2.5 font-bold">Reactive Power</td>
                      <td className="py-1 px-2.5 font-mono font-bold">
                        {(activeSelectedBus.q_mvar ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1 px-2.5 text-slate-500 font-mono">MVAR</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Connected Branch Corridors with Direct Shut Down / Close Buttons */}
              <div className="mt-3">
                <span className="text-[10px] uppercase font-black text-slate-500 block tracking-wider mb-1.5">
                  Connected Transmission Lines (Shut Down / Restore)
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {lines
                    .filter(
                      (l) =>
                        l.from_bus === activeSelectedBus.id || l.to_bus === activeSelectedBus.id
                    )
                    .map((l) => {
                      const isTripped = trippedLines.includes(l.id);
                      return (
                        <div
                          key={l.id}
                          className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50 text-[10px]"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-slate-900 block truncate">
                              {l.name || `Line #${l.id}`}
                            </span>
                            <span className="font-mono text-slate-500 text-[9px] font-semibold">
                              {isTripped
                                ? 'OPEN (0.0 MW)'
                                : `${(l.flow_mw ?? l.p_mw ?? 0).toFixed(1)} MW • ${(
                                    l.loading_percent ?? 0
                                  ).toFixed(0)}% load`}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleLine(l.id)}
                            className={`px-2.5 py-1 rounded font-bold transition shrink-0 ${
                              isTripped
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-rose-600 text-white hover:bg-rose-700'
                            }`}
                          >
                            {isTripped ? 'Close Line' : 'Shut Down'}
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