'use strict';

/*
 * MazeArt — tiny deterministic maze → inline SVG
 * --------------------------------------------------------------------
 * window.HollldMazeArt.svg({ cols, rows, cell, seed, label }) returns markup:
 *   <svg> .maze-art-walls (path) · .maze-art-route (solution, pathLength=1)
 *         .maze-art-start · .maze-art-goal
 * Styling + the "solve" animation live in css/home-style.css.
 * Used by the home-page teaser and the maze hub hero.
 */
(function defineMazeArt() {

    function rng(seed) {
        let a = seed >>> 0;

        return function next() {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function build(cols, rows, seed) {
        const rand = rng(seed);
        const total = cols * rows;
        const open = new Uint8Array(total);          // 1=right 2=down 4=left 8=up
        const seen = new Uint8Array(total);
        const stack = [0];
        const DIRS = [[1, 0, 1, 4], [0, 1, 2, 8], [-1, 0, 4, 1], [0, -1, 8, 2]];

        seen[0] = 1;

        while (stack.length) {
            const cur = stack[stack.length - 1];
            const cx = cur % cols;
            const cy = (cur / cols) | 0;
            const options = [];

            for (const [dx, dy, bit, opposite] of DIRS) {
                const nx = cx + dx;
                const ny = cy + dy;

                if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx]) {
                    options.push([ny * cols + nx, bit, opposite]);
                }
            }

            if (!options.length) {
                stack.pop();
                continue;
            }

            const [next, bit, opposite] = options[(rand() * options.length) | 0];

            open[cur] |= bit;
            open[next] |= opposite;
            seen[next] = 1;
            stack.push(next);
        }

        /* BFS from the top-left cell; the farthest cell becomes the goal */
        const parent = new Int32Array(total).fill(-2);
        const queue = [0];
        let head = 0;
        let goal = 0;

        parent[0] = -1;

        while (head < queue.length) {
            const cur = queue[head++];
            goal = cur;

            const cx = cur % cols;
            const cy = (cur / cols) | 0;
            const mask = open[cur];

            if ((mask & 1) && parent[cur + 1] === -2) { parent[cur + 1] = cur; queue.push(cur + 1); }
            if ((mask & 2) && parent[cur + cols] === -2) { parent[cur + cols] = cur; queue.push(cur + cols); }
            if ((mask & 4) && cx > 0 && parent[cur - 1] === -2) { parent[cur - 1] = cur; queue.push(cur - 1); }
            if ((mask & 8) && cy > 0 && parent[cur - cols] === -2) { parent[cur - cols] = cur; queue.push(cur - cols); }
        }

        const route = [];

        for (let n = goal; n !== -1; n = parent[n]) {
            route.push(n);
        }

        return { open, route: route.reverse(), goal };
    }

    function svg(options = {}) {
        const cols = options.cols || 10;
        const rows = options.rows || 7;
        const cell = options.cell || 40;
        const seed = options.seed || 7;
        const label = options.label || 'Maze illustration';
        const pad = 6;

        const { open, route, goal } = build(cols, rows, seed);
        const w = cols * cell;
        const h = rows * cell;

        let walls = `M${pad} ${pad}H${w + pad}V${h + pad}H${pad}Z`;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const i = r * cols + c;
                const x = pad + c * cell;
                const y = pad + r * cell;

                if (c < cols - 1 && !(open[i] & 1)) {
                    walls += `M${x + cell} ${y}V${y + cell}`;
                }
                if (r < rows - 1 && !(open[i] & 2)) {
                    walls += `M${x} ${y + cell}H${x + cell}`;
                }
            }
        }

        const pt = index => ({
            x: pad + (index % cols) * cell + cell / 2,
            y: pad + ((index / cols) | 0) * cell + cell / 2
        });

        const routePath = route
            .map((index, n) => {
                const p = pt(index);
                return `${n === 0 ? 'M' : 'L'}${p.x} ${p.y}`;
            })
            .join('');

        const start = pt(0);
        const end = pt(goal);

        return `
            <svg viewBox="0 0 ${w + pad * 2} ${h + pad * 2}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
                <path class="maze-art-walls" d="${walls}"/>
                <path class="maze-art-route" d="${routePath}" pathLength="1"/>
                <circle class="maze-art-start" cx="${start.x}" cy="${start.y}" r="5"/>
                <rect class="maze-art-goal" x="${end.x - 7}" y="${end.y - 7}" width="14" height="14" rx="4"/>
            </svg>
        `;
    }

    window.HollldMazeArt = { svg };

})();
