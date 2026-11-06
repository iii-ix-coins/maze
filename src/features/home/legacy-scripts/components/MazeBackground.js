'use strict';

/**
 * Deterministic maze camera:
 * - One closed, predefined route (no random targets).
 * - Scroll delta moves the camera along the route immediately.
 * - When scrolling stops, the same route continues very slowly.
 * - All themes share one transformed SVG group, so theme changes never reset camera position.
 *
 * Notes:
 * 1) CAMERA_ROUTE values are normalized against the SVG viewBox (0..1).
 * 2) These starter waypoints create a smooth panoramic route over the maze. For a
 *    route that follows exact corridor centerlines, replace the waypoints with points
 *    traced from the actual SVG after checking its full <svg>/<g transform> structure.
 */

let initialized = false;

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX = {
    x: 0,
    y: 0,
    width: 1500,
    height: 1500
};

const ORBIT_CYCLES = 1;

const ORBIT_AMPLITUDE_X = VIEWBOX.width * 0.009;
const ORBIT_AMPLITUDE_Y = VIEWBOX.height * 0.012;
// Both modes are 25% faster than the previous settings.
// Scroll: one loop per 7,600 px (was 9,500 px).
const SCROLL_PIXELS_PER_LOOP = 3690;

// Idle: one loop every 240 seconds (was 300 seconds).
const IDLE_SECONDS_PER_LOOP = 420;
const SCROLL_IDLE_DELAY_MS = 150;
const MAX_FRAME_DELTA_MS = 100;
const CAMERA_SMOOTHING_MS = 150;

const THEME_ASSETS = {
    grass: {
        image: new URL('../../css/images/3D-bg-grass.svg', import.meta.url).href,
    },
    dark: {
        image: new URL('../../css/images/3D-bg-dark.svg', import.meta.url).href,
    },
    light: {
        image: new URL('../../css/images/3D-bg-light.svg', import.meta.url).href,
    }
};

const ZOOM_MULTIPLIER = 1.6;
/**
 * Predefined camera centers, normalized to the SVG viewBox.
 * Zoom/rotation vary gently at fixed points; position is interpolated on a closed spline.
 * These are a starting panoramic route, not an automatically extracted maze solution.
 */
const CAMERA_ROUTE = [
    // Start the camera at the exact center of the SVG viewBox / screen.
    { u: 0.500, v: 0.500, zoom: 2.56, rotation: 0.00 },
    { u: 0.500, v: 0.265, zoom: 2.40, rotation: -0.05 },
    { u: 0.625, v: 0.292, zoom: 2.23, rotation: 0.18 },
    { u: 0.710, v: 0.365, zoom: 2.49, rotation: 0.38 },
    { u: 0.708, v: 0.455, zoom: 2.54, rotation: 0.20 },
    { u: 0.625, v: 0.535, zoom: 2.40, rotation: -0.12 },
    { u: 0.505, v: 0.575, zoom: 2.54, rotation: -0.34 },
    { u: 0.390, v: 0.625, zoom: 2.40, rotation: -0.18 },
    { u: 0.305, v: 0.710, zoom: 2.55, rotation: 0.12 },
    { u: 0.365, v: 0.750, zoom: 2.49, rotation: 0.32 },
    { u: 0.485, v: 0.720, zoom: 2.53, rotation: 0.16 },
    { u: 0.600, v: 0.655, zoom: 2.40, rotation: -0.12 },
    { u: 0.690, v: 0.575, zoom: 2.56, rotation: -0.32 },
    { u: 0.688, v: 0.475, zoom: 2.40, rotation: -0.16 },
    { u: 0.610, v: 0.375, zoom: 2.53, rotation: 0.12 },
    { u: 0.500, v: 0.315, zoom: 2.49, rotation: 0.05 }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hasTheme = theme => Object.prototype.hasOwnProperty.call(THEME_ASSETS, theme);
const wrap01 = value => ((value % 1) + 1) % 1;
const format = value => Number(value.toFixed(3)).toString();

function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
    return element;
}

function catmullRomSegment(points, index) {
    const count = points.length;
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];

    // Catmull-Rom converted to cubic Bezier control points (closed, smooth route).
    const c1 = {
        x: p1.x + (p2.x - p0.x) / 6,
        y: p1.y + (p2.y - p0.y) / 6
    };
    const c2 = {
        x: p2.x - (p3.x - p1.x) / 6,
        y: p2.y - (p3.y - p1.y) / 6
    };

    const d = `M ${format(p1.x)} ${format(p1.y)} C ${format(c1.x)} ${format(c1.y)} ${format(c2.x)} ${format(c2.y)} ${format(p2.x)} ${format(p2.y)}`;
    const command = `C ${format(c1.x)} ${format(c1.y)} ${format(c2.x)} ${format(c2.y)} ${format(p2.x)} ${format(p2.y)}`;

    return { d, command, c1, c2, start: p1, end: p2 };
}

function interpolateAngle(from, to, t) {
    const delta = ((to - from + 540) % 360) - 180;
    return from + delta * t;
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

export function initMazeBackground() {
    if (initialized || typeof window === 'undefined' || !document.documentElement) {
        return;
    }
    initialized = true;

    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    let requestedTheme = hasTheme(root.dataset.theme)
        ? root.dataset.theme
        : 'grass';

    let routeProgress = 0;
    let cameraProgress = 0;
    let previousScrollY = window.scrollY || root.scrollTop || 0;
    let lastScrollAt = performance.now() - SCROLL_IDLE_DELAY_MS;
    let previousFrameAt = performance.now();
    let animationFrameId = 0;

    const centerX = VIEWBOX.width / 2;
    const centerY = VIEWBOX.height / 2;

    // Outer SVG is a fixed viewport. Only the shared world group moves.
    const viewport = createSvgElement('svg', {
        class: 'maze-viewport',
        viewBox: `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`,
        preserveAspectRatio: 'xMidYMid slice',
        'aria-hidden': 'true',
        focusable: 'false'
    });

    const canvas = createSvgElement('rect', {
        class: 'maze-canvas',
        x: VIEWBOX.x,
        y: VIEWBOX.y,
        width: VIEWBOX.width,
        height: VIEWBOX.height,
    });
    viewport.appendChild(canvas);

    const world = createSvgElement('g', { id: 'maze-world' });
    viewport.appendChild(world);

    const imageElements = new Map();

    for (const [theme, asset] of Object.entries(THEME_ASSETS)) {
        const image = createSvgElement('image', {
            class: `maze-image${theme === requestedTheme ? ' is-active' : ''}`,
            'data-theme': theme,
            x: VIEWBOX.x,
            y: VIEWBOX.y,
            width: VIEWBOX.width,
            height: VIEWBOX.height,
            preserveAspectRatio: 'none'
        });

        image.dataset.loaded = 'false';
        image.addEventListener('load', () => {
            image.dataset.loaded = 'true';
            if (theme === requestedTheme) {
                activateTheme(theme);
            }
        });
        image.addEventListener('error', () => {
            image.dataset.loadError = 'true';
            console.error(`[MazeBackground] Could not load theme image: ${asset.image}`);
            if (theme === requestedTheme) {
                // Preserve the selected canvas color if an SVG asset fails to load.
                canvas.style.fill = asset.color;
            }
        });

        image.setAttribute('href', asset.image);
        world.appendChild(image);
        imageElements.set(theme, image);
    }

    root.appendChild(viewport);

    function activateTheme(theme) {
        if (!hasTheme(theme)) {
            return;
        }

        requestedTheme = theme;
        for (const [imageTheme, image] of imageElements) {
            image.classList.toggle('is-active', imageTheme === theme);
        }
        root.style.backgroundColor = THEME_ASSETS[theme].color;
    }

    // Convert normalized route points to the real SVG viewBox coordinate system.
    const routePoints = CAMERA_ROUTE.map(point => ({
        x: VIEWBOX.x + point.u * VIEWBOX.width,
        y: VIEWBOX.y + point.v * VIEWBOX.height,
        zoom: point.zoom * ZOOM_MULTIPLIER,
        rotation: point.rotation
    }));

    const segmentGeometry = routePoints.map((_, index) =>
        catmullRomSegment(routePoints, index)
    );

    const routeD = `M ${format(routePoints[0].x)} ${format(routePoints[0].y)} ${segmentGeometry
        .map(segment => segment.command)
        .join(' ')}`;

    // Hidden SVG path is used only for accurate arc-length sampling.
    const routePath = createSvgElement('path', {
        d: routeD,
        fill: 'none',
        stroke: 'none',
        'aria-hidden': 'true'
    });
    viewport.appendChild(routePath);

    // Measure each cubic segment so scroll progress advances by distance, not by waypoint index.
    const segmentLengths = segmentGeometry.map(segment => {
        const measuringPath = createSvgElement('path', {
            d: segment.d,
            fill: 'none',
            stroke: 'none',
            'aria-hidden': 'true'
        });
        viewport.appendChild(measuringPath);
        const length = measuringPath.getTotalLength();
        measuringPath.remove();
        return length;
    });

    const routeLength = routePath.getTotalLength();
    const segmentStartLengths = [];
    let cumulativeLength = 0;
    for (const length of segmentLengths) {
        segmentStartLengths.push(cumulativeLength);
        cumulativeLength += length;
    }

    function getCameraState(progress) {
        const distance = wrap01(progress) * routeLength;
        const point = routePath.getPointAtLength(distance);

        let segmentIndex = segmentLengths.length - 1;
        for (let i = 0; i < segmentLengths.length; i += 1) {
            if (distance < segmentStartLengths[i] + segmentLengths[i]) {
                segmentIndex = i;
                break;
            }
        }

        const segmentLength = Math.max(0.001, segmentLengths[segmentIndex]);
        const localT = clamp(
            (distance - segmentStartLengths[segmentIndex]) / segmentLength,
            0,
            1
        );
        const easedT = smoothstep(localT);
        const start = routePoints[segmentIndex];
        const end = routePoints[(segmentIndex + 1) % routePoints.length];

        const wavePhase =
            wrap01(progress) * Math.PI * 2 * ORBIT_CYCLES;
            
        return {
            x: point.x +
                (Math.cos(wavePhase) - 1) * ORBIT_AMPLITUDE_X,

            y: point.y +
                Math.sin(wavePhase) * ORBIT_AMPLITUDE_Y,

            zoom: start.zoom + (end.zoom - start.zoom) * easedT,

            rotation: interpolateAngle(
                start.rotation,
                end.rotation,
                easedT
            )
        };
    }

    function renderCamera(progress = cameraProgress) {
        const camera = getCameraState(progress);
        world.setAttribute(
            'transform',
            `translate(${format(centerX)} ${format(centerY)}) ` +
            `rotate(${format(camera.rotation)}) ` +
            `scale(${format(camera.zoom)}) ` +
            `translate(${format(-camera.x)} ${format(-camera.y)})`
        );
    }

    function handleScroll() {
        const currentScrollY = window.scrollY || root.scrollTop || 0;
        const deltaY = currentScrollY - previousScrollY;
        previousScrollY = currentScrollY;

        if (prefersReducedMotion || deltaY === 0) {
            return;
        }

        // Any scroll movement advances forward; upward scrolling never reverses the route.
        routeProgress += Math.abs(deltaY) / SCROLL_PIXELS_PER_LOOP;
        lastScrollAt = performance.now();
    }

    function handleThemeChange(event) {
        const nextTheme = event.detail?.theme;
        if (!hasTheme(nextTheme)) {
            return;
        }

        requestedTheme = nextTheme;
        const image = imageElements.get(nextTheme);

        // If the incoming SVG is already loaded, crossfade immediately.
        // Otherwise its load handler commits the theme as soon as it's ready.
        if (image?.dataset.loaded === 'true') {
            activateTheme(nextTheme);
        } else {
            canvas.style.fill = THEME_ASSETS[nextTheme].color;
        }
    }

    function tick(now) {
        const deltaMs = clamp(now - previousFrameAt, 0, MAX_FRAME_DELTA_MS);
        previousFrameAt = now;

        if (!prefersReducedMotion && now - lastScrollAt > SCROLL_IDLE_DELAY_MS) {
            routeProgress += (deltaMs / 1000) / IDLE_SECONDS_PER_LOOP;
        }

        // حرکت نرم دوربین به سمت مقصد، بدون پرش
        const alpha = 1 - Math.exp(-deltaMs / CAMERA_SMOOTHING_MS);

        cameraProgress += (routeProgress - cameraProgress) * alpha;

        renderCamera(cameraProgress);

        animationFrameId = window.requestAnimationFrame(tick);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('site:themechange', handleThemeChange);

    // Start from a stable camera pose before automatic idle motion begins.
    renderCamera();
    if (!prefersReducedMotion) {
        animationFrameId = window.requestAnimationFrame(tick);
    }

    // Keep a reference for debugging/cleanup in single-page navigation environments.
    viewport.dataset.animationFrameId = String(animationFrameId);
}
