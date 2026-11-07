'use strict';

/*
 * Backdrop — "Maze Veil"
 * --------------------------------------------------------------------
 * A fixed, non-interactive background layer shared by every page:
 *   aurora blobs  →  generated maze (dim base + cursor-lit twin)  →
 *   a glowing runner that solves it  →  film grain  →  vignette.
 *
 * Pure canvas 2D, ~30 fps, paused when the tab is hidden, static when the
 * user prefers reduced motion. Styling lives in css/style.css (.backdrop*).
 * The maze is regenerated every time the runner reaches the exit.
 */
(function mountBackdrop() {

    if (document.getElementById('fx-backdrop')) {
        return;
    }

    /* ------------------------------------------------------------------
       DOM
       ------------------------------------------------------------------ */

    const root = document.createElement('div');
    root.id = 'fx-backdrop';
    root.className = 'backdrop';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
        <div class="backdrop-aurora"><i></i><i></i><i></i><i></i></div>
        <canvas class="backdrop-maze backdrop-maze--base"></canvas>
        <canvas class="backdrop-maze backdrop-maze--glow"></canvas>
        <canvas class="backdrop-runner"></canvas>
        <div class="backdrop-grain"></div>
        <div class="backdrop-vignette"></div>
    `;

    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.setAttribute('aria-hidden', 'true');

    document.body.prepend(root);
    document.body.prepend(progress);

    const baseCanvas = root.querySelector('.backdrop-maze--base');
    const glowCanvas = root.querySelector('.backdrop-maze--glow');
    const runCanvas = root.querySelector('.backdrop-runner');

    const baseCtx = baseCanvas.getContext('2d');
    const glowCtx = glowCanvas.getContext('2d');
    const runCtx = runCanvas.getContext('2d');

    if (!baseCtx || !glowCtx || !runCtx) {
        return;
    }

    const reducedMotion =
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const saveData =
        Boolean(navigator.connection && navigator.connection.saveData);

    /* ------------------------------------------------------------------
       STATE
       ------------------------------------------------------------------ */

    let width = 0;
    let height = 0;
    let dpr = 1;
    let cell = 64;
    let cols = 0;
    let rows = 0;
    let offsetX = 0;
    let offsetY = 0;

    /** open[i] bit mask: 1 = right open, 2 = down open, 4 = left, 8 = up */
    let open = new Uint8Array(0);
    let route = [];
    let routeIndex = 0;
    let routeProgress = 0;
    let finishPulse = 0;
    let regenerating = false;

    let rafId = 0;
    let lastFrame = 0;
    let pointerUntil = 0;
    let glowX = 0.72;
    let glowY = 0.18;

    /* ------------------------------------------------------------------
       HELPERS
       ------------------------------------------------------------------ */

    function mulberry32(seed) {
        let a = seed >>> 0;

        return function next() {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function centre(index) {
        const c = index % cols;
        const r = (index / cols) | 0;

        return {
            x: offsetX + c * cell + cell / 2,
            y: offsetY + r * cell + cell / 2
        };
    }

    /* ------------------------------------------------------------------
       MAZE — iterative recursive-backtracker + BFS solution
       ------------------------------------------------------------------ */

    function generate() {
        const rand = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
        const total = cols * rows;

        open = new Uint8Array(total);

        const visited = new Uint8Array(total);
        const stack = [];
        const start = (rand() * total) | 0;

        visited[start] = 1;
        stack.push(start);

        const DIRS = [
            [1, 0, 1, 4],    // right
            [0, 1, 2, 8],    // down
            [-1, 0, 4, 1],   // left
            [0, -1, 8, 2]    // up
        ];

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const cx = current % cols;
            const cy = (current / cols) | 0;
            const options = [];

            for (const [dx, dy, bit, opposite] of DIRS) {
                const nx = cx + dx;
                const ny = cy + dy;

                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
                    continue;
                }

                const next = ny * cols + nx;

                if (!visited[next]) {
                    options.push([next, bit, opposite]);
                }
            }

            if (options.length === 0) {
                stack.pop();
                continue;
            }

            const [next, bit, opposite] =
                options[(rand() * options.length) | 0];

            open[current] |= bit;
            open[next] |= opposite;
            visited[next] = 1;
            stack.push(next);
        }

        solve(rand);
    }

    function solve(rand) {
        const total = cols * rows;

        /* start somewhere in the upper-left third, exit = farthest cell */
        const sx = (rand() * Math.max(1, cols / 3)) | 0;
        const sy = (rand() * Math.max(1, rows / 3)) | 0;
        const start = sy * cols + sx;

        const parent = new Int32Array(total).fill(-2);
        const queue = [start];
        let head = 0;
        let last = start;

        parent[start] = -1;

        while (head < queue.length) {
            const current = queue[head++];
            last = current;

            const cx = current % cols;
            const cy = (current / cols) | 0;
            const mask = open[current];

            if (mask & 1 && parent[current + 1] === -2) {
                parent[current + 1] = current;
                queue.push(current + 1);
            }
            if (mask & 2 && parent[current + cols] === -2) {
                parent[current + cols] = current;
                queue.push(current + cols);
            }
            if (mask & 4 && cx > 0 && parent[current - 1] === -2) {
                parent[current - 1] = current;
                queue.push(current - 1);
            }
            if (mask & 8 && cy > 0 && parent[current - cols] === -2) {
                parent[current - cols] = current;
                queue.push(current - cols);
            }
        }

        const path = [];

        for (let node = last; node !== -1; node = parent[node]) {
            path.push(node);
        }

        route = path.reverse();
        routeIndex = 0;
        routeProgress = 0;
        finishPulse = 0;
    }

    /* ------------------------------------------------------------------
       DRAW — static walls (two canvases: dim base + bright twin)
       ------------------------------------------------------------------ */

    function strokeWalls(ctx, color, lineWidth, nodeColor) {
        ctx.clearRect(0, 0, width, height);
        ctx.lineCap = 'round';
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color;
        ctx.beginPath();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const i = r * cols + c;
                const x = offsetX + c * cell;
                const y = offsetY + r * cell;

                if (!(open[i] & 1)) {
                    ctx.moveTo(x + cell, y);
                    ctx.lineTo(x + cell, y + cell);
                }
                if (!(open[i] & 2)) {
                    ctx.moveTo(x, y + cell);
                    ctx.lineTo(x + cell, y + cell);
                }
            }
        }

        ctx.stroke();

        /* blueprint nodes at wall intersections */
        ctx.fillStyle = nodeColor;
        ctx.beginPath();

        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
                const x = offsetX + c * cell;
                const y = offsetY + r * cell;

                ctx.moveTo(x + 1.6, y);
                ctx.arc(x, y, 1.6, 0, Math.PI * 2);
            }
        }

        ctx.fill();
    }

    function paintStatic() {
        strokeWalls(
            baseCtx,
            'rgba(150, 190, 255, 0.085)',
            1.25,
            'rgba(150, 190, 255, 0.10)'
        );

        strokeWalls(
            glowCtx,
            'rgba(110, 255, 214, 0.85)',
            1.6,
            'rgba(180, 255, 235, 0.9)'
        );
    }

    /* ------------------------------------------------------------------
       DRAW — animated runner
       ------------------------------------------------------------------ */

    function position() {
        const a = centre(route[routeIndex]);
        const b = centre(route[Math.min(routeIndex + 1, route.length - 1)]);

        return {
            x: a.x + (b.x - a.x) * routeProgress,
            y: a.y + (b.y - a.y) * routeProgress
        };
    }

    function drawRunner() {
        runCtx.clearRect(0, 0, width, height);

        if (route.length < 2) {
            return;
        }

        const TRAIL = 16;
        const first = Math.max(0, routeIndex - TRAIL);
        const head = position();

        runCtx.lineCap = 'round';
        runCtx.lineJoin = 'round';

        /* trail: older segments are dimmer and thinner */
        for (let i = first; i < routeIndex; i++) {
            const age = (routeIndex - i) / TRAIL;
            const a = centre(route[i]);
            const b = i + 1 === routeIndex ? head : centre(route[i + 1]);

            runCtx.strokeStyle = `rgba(110, 255, 214, ${0.62 * (1 - age)})`;
            runCtx.lineWidth = 3.2 * (1 - age * 0.7);
            runCtx.beginPath();
            runCtx.moveTo(a.x, a.y);
            runCtx.lineTo(b.x, b.y);
            runCtx.stroke();
        }

        /* head */
        const halo = runCtx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 26);
        halo.addColorStop(0, 'rgba(160, 255, 228, 0.95)');
        halo.addColorStop(0.18, 'rgba(110, 255, 214, 0.5)');
        halo.addColorStop(1, 'rgba(110, 255, 214, 0)');
        runCtx.fillStyle = halo;
        runCtx.beginPath();
        runCtx.arc(head.x, head.y, 26, 0, Math.PI * 2);
        runCtx.fill();

        runCtx.fillStyle = '#eafff8';
        runCtx.beginPath();
        runCtx.arc(head.x, head.y, 3, 0, Math.PI * 2);
        runCtx.fill();

        /* exit marker + completion pulse */
        const exit = centre(route[route.length - 1]);

        runCtx.strokeStyle = 'rgba(255, 214, 120, 0.75)';
        runCtx.lineWidth = 1.5;
        runCtx.strokeRect(exit.x - 5, exit.y - 5, 10, 10);

        if (finishPulse > 0) {
            runCtx.strokeStyle = `rgba(255, 214, 120, ${0.8 * (1 - finishPulse)})`;
            runCtx.beginPath();
            runCtx.arc(exit.x, exit.y, 8 + finishPulse * 70, 0, Math.PI * 2);
            runCtx.stroke();
        }
    }

    /* ------------------------------------------------------------------
       LOOP
       ------------------------------------------------------------------ */

    function followGlow(head) {
        /* when the pointer has been idle, the lit patch rides the runner */
        const now = performance.now();

        if (now < pointerUntil || !head) {
            return;
        }

        glowX += (head.x / width - glowX) * 0.05;
        glowY += (head.y / height - glowY) * 0.05;

        root.style.setProperty('--px', `${(glowX * 100).toFixed(2)}%`);
        root.style.setProperty('--py', `${(glowY * 100).toFixed(2)}%`);
    }

    function step(dt) {
        if (route.length < 2 || regenerating) {
            drawRunner();
            return;
        }

        const SPEED = 5.2; // cells per second
        routeProgress += dt * SPEED;

        while (routeProgress >= 1 && routeIndex < route.length - 1) {
            routeProgress -= 1;
            routeIndex++;
        }

        if (routeIndex >= route.length - 1) {
            routeIndex = route.length - 1;
            routeProgress = 0;
            finishPulse += dt * 0.9;

            if (finishPulse >= 1) {
                morph();
            }
        }

        drawRunner();
        followGlow(position());
    }

    function frame(now) {
        rafId = requestAnimationFrame(frame);

        if (now - lastFrame < 32) {
            return;
        }

        const dt = Math.min((now - lastFrame) / 1000, 0.1);
        lastFrame = now;
        step(dt);
    }

    function start() {
        if (rafId || reducedMotion || saveData) {
            return;
        }

        lastFrame = performance.now();
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }

    /** cross-fade into a freshly generated maze */
    function morph() {
        if (regenerating) {
            return;
        }

        regenerating = true;

        for (const canvas of [baseCanvas, glowCanvas, runCanvas]) {
            canvas.style.opacity = '0';
        }

        window.setTimeout(() => {
            generate();
            paintStatic();
            runCtx.clearRect(0, 0, width, height);

            for (const canvas of [baseCanvas, glowCanvas, runCanvas]) {
                canvas.style.opacity = '1';
            }

            regenerating = false;
        }, 950);
    }

    /* ------------------------------------------------------------------
       LAYOUT
       ------------------------------------------------------------------ */

    function build() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;

        for (const canvas of [baseCanvas, glowCanvas, runCanvas]) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }

        for (const ctx of [baseCtx, glowCtx, runCtx]) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        cell = Math.max(46, Math.min(84, Math.round(Math.max(width, height) / 21)));
        cols = Math.ceil(width / cell) + 1;
        rows = Math.ceil(height / cell) + 1;
        offsetX = -((cols * cell - width) / 2);
        offsetY = -((rows * cell - height) / 2);

        generate();
        paintStatic();

        if (reducedMotion || saveData) {
            runCtx.clearRect(0, 0, width, height);
        }
    }

    for (const canvas of [baseCanvas, glowCanvas, runCanvas]) {
        canvas.style.transition = 'opacity 0.9s ease';
    }

    let resizeTimer = 0;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);

        resizeTimer = window.setTimeout(() => {
            const dw = Math.abs(window.innerWidth - lastWidth);
            const dh = Math.abs(window.innerHeight - lastHeight);

            /* ignore mobile URL-bar jitter */
            if (dw < 2 && dh < 140) {
                return;
            }

            lastWidth = window.innerWidth;
            lastHeight = window.innerHeight;
            build();
        }, 260);
    }, { passive: true });

    /* pointer-lit maze */
    let pointerFrame = 0;

    window.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch' || reducedMotion) {
            return;
        }

        pointerUntil = performance.now() + 3200;

        if (pointerFrame) {
            return;
        }

        pointerFrame = requestAnimationFrame(() => {
            pointerFrame = 0;
            glowX = event.clientX / width;
            glowY = event.clientY / height;
            root.style.setProperty('--px', `${event.clientX}px`);
            root.style.setProperty('--py', `${event.clientY}px`);
        });
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stop();
        } else {
            start();
        }
    });

    build();
    start();

})();
