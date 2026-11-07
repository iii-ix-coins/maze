'use strict';

/*
 * MazeTeaser — home-page promo for the Maze game (mounts into #site-maze-teaser).
 * Copy comes from the maze pro lobby ("One maze. One race. Your route.").
 * Needs components/MazeArt.js to be loaded first.
 */
(function mountMazeTeaser() {
    const target = document.getElementById('site-maze-teaser');

    if (!target) {
        return;
    }

    const art = window.HollldMazeArt
        ? window.HollldMazeArt.svg({
            cols: 10,
            rows: 7,
            cell: 40,
            seed: 20261022,
            label: 'A maze being solved by a glowing path'
        })
        : '';

    target.className = 'site-maze-teaser-host';

    target.innerHTML = `
        <section class="maze-teaser" aria-labelledby="maze-teaser-title">

            <div class="maze-teaser-copy">
                <span class="eyebrow">New · Maze</span>

                <h2 id="maze-teaser-title" class="maze-teaser-title">
                    One maze.<br>One race.<br><em>Your route.</em>
                </h2>

                <p>
                    Race through the same maze. Targets unlock one by one —
                    route planning matters.
                </p>

                <a class="btn btn--primary" href="./maze.html">
                    Enter the Maze <span aria-hidden="true">→</span>
                </a>
            </div>

            <div class="maze-teaser-art">${art}</div>

        </section>
    `;
})();
