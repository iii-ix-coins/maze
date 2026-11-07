'use strict';

/*
 * MazeHub — hero + feature bento for maze.html (mounts into #site-maze-hub).
 * All copy is taken from the maze-pro game itself (lobby text, modes, tools).
 * Needs components/MazeArt.js to be loaded first.
 */
(function mountMazeHub() {
    const target = document.getElementById('site-maze-hub');

    if (!target) {
        return;
    }

    const art = window.HollldMazeArt
        ? window.HollldMazeArt.svg({
            cols: 10,
            rows: 7,
            cell: 40,
            seed: 7102026,
            label: 'A maze with a glowing solution path'
        })
        : '';

    const icon = (body) => `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

    const ICONS = {
        race:  icon('<circle cx="6" cy="17" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M8 17h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5"/>'),
        order: icon('<path d="M5 6h4M5 12h8M5 18h12"/><circle cx="18" cy="6" r="1.6"/><circle cx="18" cy="12" r="1.6" opacity=".5"/>'),
        torch: icon('<path d="M9 3h6l-1 6H10z"/><path d="M10 9l-1 12h6l-1-12"/><path d="M12 13v3"/>'),
        hint:  icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
        pad:   icon('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3"/><path d="M12 6v1.5M12 16.5V18M6 12h1.5M16.5 12H18"/>')
    };

    target.className = 'site-maze-hub-host';

    target.innerHTML = `
        <section class="maze-hero" aria-labelledby="maze-hero-title">

            <div class="maze-hero-copy">
                <span class="eyebrow">Maze · Race lobby</span>

                <h1 id="maze-hero-title" class="maze-hero-title">
                    <span>One maze.</span>
                    <span>Your route.</span>
                </h1>

                <p>
                    Race through the same maze. Targets unlock one by one —
                    route planning matters.
                </p>

                <div class="maze-chip-row">
                    <span class="pill">2–10 racers</span>
                    <span class="pill">3 · 6 · 9 targets</span>
                    <span class="pill">Free play, no waiting</span>
                </div>

                <div class="maze-hero-actions">
                    <a class="btn btn--primary" href="#site-maze-app">
                        Pick a race <span aria-hidden="true">↓</span>
                    </a>
                    <a class="btn btn--ghost" href="./holders.html">
                        See the holders
                    </a>
                </div>
            </div>

            <div class="maze-hero-art" aria-hidden="true">${art}</div>

        </section>

        <div class="maze-features">

            <article class="maze-tile">
                <span class="maze-tile-icon">${ICONS.race}</span>
                <h3>Live races</h3>
                <p>Everyone gets the same maze. Match with 2 to 10 racers and watch the live standings climb.</p>
            </article>

            <article class="maze-tile">
                <span class="maze-tile-icon">${ICONS.order}</span>
                <h3>Targets in order</h3>
                <p>Collect every point 01 → 02 → 03. Choose 3, 6 or 9 targets — the order is the whole game.</p>
            </article>

            <article class="maze-tile">
                <span class="maze-tile-icon">${ICONS.torch}</span>
                <h3>Torch</h3>
                <p>Switch the fog on and light only what is around you.</p>
            </article>

            <article class="maze-tile">
                <span class="maze-tile-icon">${ICONS.hint}</span>
                <h3>Hints</h3>
                <p>Three hints per maze when the path stops making sense.</p>
            </article>

            <article class="maze-tile">
                <span class="maze-tile-icon">${ICONS.pad}</span>
                <h3>Mini-map &amp; joystick</h3>
                <p>Drag the mini-map to move the camera; touch screens get a movable joystick.</p>
            </article>

        </div>
    `;
})();
