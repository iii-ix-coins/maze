'use strict';

/*
 * sparkline.js — price trend line for the coin page (#coin-sparkline).
 * --------------------------------------------------------------------
 * Uses the endpoint that already exists but was unused by the UI:
 *     GET /api/jupiter-market/history?limit=N
 *         → { ok, items: [{ fetchedAtMs, data: { priceV3: { usdPrice }, tokenV2: { usdPrice } } }, …] }   (newest first)
 * No server change. If the endpoint is warming up, empty or fails, the
 * element simply stays hidden. Styling lives in css/coin-style.css.
 */
(function initSparkline() {
    const host = document.getElementById('coin-sparkline');

    if (!host) {
        return;
    }

    const LIMIT = 240;
    const REFRESH_MS = 60_000;
    const W = 320;
    const H = 110;
    const PAD = 6;

    function priceOf(item) {
        const data = item?.data;
        const value = Number(data?.priceV3?.usdPrice ?? data?.tokenV2?.usdPrice);

        return Number.isFinite(value) && value > 0 ? value : null;
    }

    function span(ms) {
        const minutes = Math.round(ms / 60_000);

        if (minutes < 90) {
            return `${minutes}m`;
        }

        const hours = minutes / 60;

        return hours < 48 ? `${hours.toFixed(hours < 10 ? 1 : 0)}h` : `${Math.round(hours / 24)}d`;
    }

    function render(points) {
        const prices = points.map(point => point.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || max * 0.002 || 1;
        const t0 = points[0].t;
        const dt = points[points.length - 1].t - t0 || 1;

        const xy = points.map(point => [
            PAD + ((point.t - t0) / dt) * (W - 2 * PAD),
            PAD + (1 - (point.price - min) / range) * (H - 2 * PAD)
        ]);

        const line = xy.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
        const area = `${line}L${xy[xy.length - 1][0].toFixed(1)} ${H}L${xy[0][0].toFixed(1)} ${H}Z`;
        const [lx, ly] = xy[xy.length - 1];
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = ((last - first) / first) * 100;

        host.dataset.trend = change >= 0 ? 'up' : 'down';
        host.hidden = false;

        host.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
                 aria-label="Price over the last ${span(dt)}: ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(2)} percent">
                <defs>
                    <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="currentColor" stop-opacity="0.34"/>
                        <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <path class="spark-area" d="${area}" fill="url(#spark-fill)"/>
                <path class="spark-line" d="${line}" pathLength="1"/>
            </svg>
            <i class="spark-dot" style="left:${((lx / W) * 100).toFixed(2)}%; top:${((ly / H) * 100).toFixed(2)}%"></i>
            <span class="spark-caption">${span(dt)} · ${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(2)}%</span>
        `;
    }

    async function load() {
        try {
            const response = await fetch(`/api/jupiter-market/history?limit=${LIMIT}`, { cache: 'no-store' });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            const points = (Array.isArray(payload?.items) ? payload.items : [])
                .map(item => ({ t: Number(item.fetchedAtMs), price: priceOf(item) }))
                .filter(point => Number.isFinite(point.t) && point.price !== null)
                .sort((a, b) => a.t - b.t);

            if (points.length < 3) {
                host.hidden = true;
                return;
            }

            render(points);
        } catch {
            /* keep whatever is shown; the sparkline is decoration */
        }
    }

    load();
    window.setInterval(() => { if (!document.hidden) { load(); } }, REFRESH_MS);
})();
