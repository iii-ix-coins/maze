// Moved verbatim from legacy/mazeV3/server/server.js (statements 142, 143, 144). Only imports/exports and `S.` state access were added.
import { intervalHandles, recentFinished, S, clients } from './state';
import { peekTick, scheduleLobbyFlush } from './lobby';
import { PEEK_TICK_MS, RECENT_TTL_MS, HOUSEKEEPING_MS, HEARTBEAT_MS } from './config';

export function initTimers() {

/* ── Timers ────────────────────────────────────────────────────────────── */
intervalHandles.push(setInterval(peekTick, PEEK_TICK_MS));
intervalHandles.push(setInterval(() => {
    // Recently-finished entries expire on their own.
    if (recentFinished.length && recentFinished.some(entry => entry.finishedAt < Date.now() - RECENT_TTL_MS)) {
        while (recentFinished.length && recentFinished[recentFinished.length - 1].finishedAt < Date.now() - RECENT_TTL_MS) recentFinished.pop();
        S.recentDirty = true;
        scheduleLobbyFlush();
    }
    // Rooms keep their "waiting for N min" clocks on the client; nothing else to age here.
}, HOUSEKEEPING_MS));
// Reverse proxies drop idle sockets after ~1 minute and phones lose connections silently.
intervalHandles.push(setInterval(() => {
    for (const peer of clients.values()) {
        if (!peer.alive) { try { peer.socket.terminate(); } catch (_) { /* closing anyway */ } continue; }
        peer.alive = false;
        try { peer.socket.ping(); } catch (_) { /* closed meanwhile */ }
    }
}, HEARTBEAT_MS));
}
