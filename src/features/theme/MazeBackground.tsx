import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef, useState } from 'react';
import { useSiteTheme } from '../../hooks/useSiteTheme';
import type { SiteTheme } from './theme';


const CAMERA_STORAGE_KEY = 'hollld-bg-camera';

function readSavedCamera(): { route: number; camera: number } | null {
  try {
    const raw = window.sessionStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { route?: unknown; camera?: unknown };
    if (
      typeof parsed.route === 'number' && Number.isFinite(parsed.route) &&
      typeof parsed.camera === 'number' && Number.isFinite(parsed.camera)
    ) {
      return { route: parsed.route, camera: parsed.camera };
    }
  } catch {
    // Storage can be unavailable; the camera simply starts from zero.
  }
  return null;
}

/**
 * React owns the decorative SVG tree. The independent camera animation updates
 * only the SVG transform at frame rate; it never feeds animation state back
 * through React and therefore cannot re-render the site or Maze UI per frame.
 */
const VIEWBOX = { x: 0, y: 0, width: 1500, height: 1500 } as const;
const ORBIT_CYCLES = 1;
const ORBIT_AMPLITUDE_X = VIEWBOX.width * 0.009;
const ORBIT_AMPLITUDE_Y = VIEWBOX.height * 0.012;
const SCROLL_PIXELS_PER_LOOP = 3690;
const IDLE_SECONDS_PER_LOOP = 420;
const SCROLL_IDLE_DELAY_MS = 150;
const MAX_FRAME_DELTA_MS = 100;
const CAMERA_SMOOTHING_MS = 150;
const ZOOM_MULTIPLIER = 1.6;

const CAMERA_ROUTE = [
  { u: 0.5, v: 0.5, zoom: 2.56, rotation: 0 },
  { u: 0.5, v: 0.265, zoom: 2.4, rotation: -0.05 },
  { u: 0.625, v: 0.292, zoom: 2.23, rotation: 0.18 },
  { u: 0.71, v: 0.365, zoom: 2.49, rotation: 0.38 },
  { u: 0.708, v: 0.455, zoom: 2.54, rotation: 0.2 },
  { u: 0.625, v: 0.535, zoom: 2.4, rotation: -0.12 },
  { u: 0.505, v: 0.575, zoom: 2.54, rotation: -0.34 },
  { u: 0.39, v: 0.625, zoom: 2.4, rotation: -0.18 },
  { u: 0.305, v: 0.71, zoom: 2.55, rotation: 0.12 },
  { u: 0.365, v: 0.75, zoom: 2.49, rotation: 0.32 },
  { u: 0.485, v: 0.72, zoom: 2.53, rotation: 0.16 },
  { u: 0.6, v: 0.655, zoom: 2.4, rotation: -0.12 },
  { u: 0.69, v: 0.575, zoom: 2.56, rotation: -0.32 },
  { u: 0.688, v: 0.475, zoom: 2.4, rotation: -0.16 },
  { u: 0.61, v: 0.375, zoom: 2.53, rotation: 0.12 },
  { u: 0.5, v: 0.315, zoom: 2.49, rotation: 0.05 },
] as const;

type CameraPoint = {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function wrap01(value: number) {
  return ((value % 1) + 1) % 1;
}

function format(value: number) {
  return Number(value.toFixed(3)).toString();
}

function catmullRomSegment(points: CameraPoint[], index: number) {
  const count = points.length;
  const p0 = points[(index - 1 + count) % count];
  const p1 = points[index];
  const p2 = points[(index + 1) % count];
  const p3 = points[(index + 2) % count];
  const c1 = {
    x: p1.x + (p2.x - p0.x) / 6,
    y: p1.y + (p2.y - p0.y) / 6,
  };
  const c2 = {
    x: p2.x - (p3.x - p1.x) / 6,
    y: p2.y - (p3.y - p1.y) / 6,
  };
  const d = `M ${format(p1.x)} ${format(p1.y)} C ${format(c1.x)} ${format(c1.y)} ${format(c2.x)} ${format(c2.y)} ${format(p2.x)} ${format(p2.y)}`;
  const command = `C ${format(c1.x)} ${format(c1.y)} ${format(c2.x)} ${format(c2.y)} ${format(p2.x)} ${format(p2.y)}`;
  return { d, command };
}

function interpolateAngle(from: number, to: number, t: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * t;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

const routePoints: CameraPoint[] = CAMERA_ROUTE.map((point) => ({
  x: VIEWBOX.x + point.u * VIEWBOX.width,
  y: VIEWBOX.y + point.v * VIEWBOX.height,
  zoom: point.zoom * ZOOM_MULTIPLIER,
  rotation: point.rotation,
}));

const segmentGeometry = routePoints.map((_, index) => catmullRomSegment(routePoints, index));
const routePathD = `M ${format(routePoints[0].x)} ${format(routePoints[0].y)} ${segmentGeometry
  .map((segment) => segment.command)
  .join(' ')}`;

export function MazeBackground() {
  const theme = useSiteTheme();
  const [activeTheme, setActiveTheme] = useState<SiteTheme>(theme);
  const [loadedThemes, setLoadedThemes] = useState<Set<SiteTheme>>(() => new Set());
  const themeRef = useRef(theme);
  const viewportRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<SVGRectElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const routePathRef = useRef<SVGPathElement>(null);
  const segmentPathRefs = useRef<Array<SVGPathElement | null>>([]);
  themeRef.current = theme;


  useLayoutEffect(() => {
    const root = document.documentElement;
    const world = worldRef.current;
    const routePath = routePathRef.current;
    const measuringPaths = segmentPathRefs.current.slice(0, segmentGeometry.length);
    if (!world || !routePath || measuringPaths.some((path) => !path)) return;

    const paths = measuringPaths as SVGPathElement[];
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saved = readSavedCamera();
    let routeProgress = saved?.route ?? 0;
    let cameraProgress = saved?.camera ?? 0;
    let previousScrollY = window.scrollY || root.scrollTop || 0;
    let lastScrollAt = performance.now() - SCROLL_IDLE_DELAY_MS;
    let previousFrameAt = performance.now();
    let animationFrameId = 0;

    const centerX = VIEWBOX.width / 2;
    const centerY = VIEWBOX.height / 2;
    const segmentLengths = paths.map((path) => path.getTotalLength());
    const routeLength = routePath.getTotalLength();
    const segmentStartLengths: number[] = [];
    let cumulativeLength = 0;
    for (const length of segmentLengths) {
      segmentStartLengths.push(cumulativeLength);
      cumulativeLength += length;
    }

    const getCameraState = (progress: number) => {
      const distance = wrap01(progress) * routeLength;
      const point = routePath.getPointAtLength(distance);
      let segmentIndex = segmentLengths.length - 1;
      for (let index = 0; index < segmentLengths.length; index += 1) {
        if (distance < segmentStartLengths[index] + segmentLengths[index]) {
          segmentIndex = index;
          break;
        }
      }

      const segmentLength = Math.max(0.001, segmentLengths[segmentIndex]);
      const localT = clamp(
        (distance - segmentStartLengths[segmentIndex]) / segmentLength,
        0,
        1,
      );
      const easedT = smoothstep(localT);
      const start = routePoints[segmentIndex];
      const end = routePoints[(segmentIndex + 1) % routePoints.length];
      const wavePhase = wrap01(progress) * Math.PI * 2 * ORBIT_CYCLES;

      return {
        x: point.x + (Math.cos(wavePhase) - 1) * ORBIT_AMPLITUDE_X,
        y: point.y + Math.sin(wavePhase) * ORBIT_AMPLITUDE_Y,
        zoom: start.zoom + (end.zoom - start.zoom) * easedT,
        rotation: interpolateAngle(start.rotation, end.rotation, easedT),
      };
    };

    const renderCamera = (progress = cameraProgress) => {
      const camera = getCameraState(progress);
      world.setAttribute(
        'transform',
        `translate(${format(centerX)} ${format(centerY)}) ` +
        `rotate(${format(camera.rotation)}) ` +
        `scale(${format(camera.zoom)}) ` +
        `translate(${format(-camera.x)} ${format(-camera.y)})`,
      );
    };

    const handleScroll = () => {
      const currentScrollY = window.scrollY || root.scrollTop || 0;
      const deltaY = currentScrollY - previousScrollY;
      previousScrollY = currentScrollY;
      // A scroll reset caused by a page swap must not move the camera.
      if (root.dataset.pageSwap) return;
      if (prefersReducedMotion || deltaY === 0) return;
      routeProgress += Math.abs(deltaY) / SCROLL_PIXELS_PER_LOOP;
      lastScrollAt = performance.now();
    };

    const tick = (now: number) => {
      const deltaMs = clamp(now - previousFrameAt, 0, MAX_FRAME_DELTA_MS);
      previousFrameAt = now;
      if (!prefersReducedMotion && now - lastScrollAt > SCROLL_IDLE_DELAY_MS) {
        routeProgress += (deltaMs / 1000) / IDLE_SECONDS_PER_LOOP;
      }
      const alpha = 1 - Math.exp(-deltaMs / CAMERA_SMOOTHING_MS);
      cameraProgress += (routeProgress - cameraProgress) * alpha;
      renderCamera(cameraProgress);
      animationFrameId = window.requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    const saveCamera = () => {
      try {
        const base = Math.floor(cameraProgress);
        window.sessionStorage.setItem(
          CAMERA_STORAGE_KEY,
          JSON.stringify({ route: routeProgress - base, camera: cameraProgress - base }),
        );
      } catch {
        // ignore
      }
    };
    window.addEventListener('pagehide', saveCamera);
    renderCamera();
    if (!prefersReducedMotion) {
      animationFrameId = window.requestAnimationFrame(tick);
    }
    if (viewportRef.current) {
      viewportRef.current.dataset.animationFrameId = String(animationFrameId);
    }

    return () => {
      window.removeEventListener('pagehide', saveCamera);
      saveCamera();
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const svg = (
    <svg
      ref={viewportRef}
      className="maze-viewport"
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        ref={canvasRef}
        className="maze-canvas"
        x={VIEWBOX.x}
        y={VIEWBOX.y}
        width={VIEWBOX.width}
        height={VIEWBOX.height}
      />
      <g ref={worldRef} id="maze-world" />
      <path ref={routePathRef} d={routePathD} fill="none" stroke="none" aria-hidden="true" />
      {segmentGeometry.map((segment, index) => (
        <path
          key={`measure-${index}`}
          ref={(node) => { segmentPathRefs.current[index] = node; }}
          d={segment.d}
          fill="none"
          stroke="none"
          aria-hidden="true"
        />
      ))}
    </svg>
  );

  return createPortal(svg, document.documentElement);
}
