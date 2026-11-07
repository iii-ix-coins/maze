/**
 * Client-side mirror of the server lobby. The server sends one `lobby:state` snapshot and then small
 * `lobby:patch` deltas; this class folds them into a Map and tells subscribers exactly what changed, so the UI can
 * animate arrivals, updates and departures instead of redrawing a list.
 *
 * Pure data, no DOM: it is unit-tested in Node.
 */
export const EMPTY_COUNTS = Object.freeze({
    waitingByMode: {}, onlinePlayers: 0, waitingPlayers: 0, waitingRooms: 0, liveRooms: 0, livePlayers: 0, spectators: 0, activeRooms: 0
});

const isWaiting = room => room.phase === 'waiting' || room.phase === 'preparing';

export class LobbyStore {
    declare rooms: any;
    declare recent: any;
    declare counts: any;
    declare clockOffset: number;
    declare ready: boolean;
    declare listeners: any;

    constructor() {
        this.rooms = new Map();
        this.recent = [];
        this.counts = { ...EMPTY_COUNTS };
        this.clockOffset = 0;
        this.ready = false;
        this.listeners = new Set();
    }

    /** Server time as seen from this device (device clocks drift, the server's does not). */
    now() { return Date.now() + this.clockOffset; }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    emit(change) {
        for (const listener of [...this.listeners]) {
            try { listener(change, this); } catch (error) { console.error('Lobby listener failed:', error); }
        }
    }
    alignClock(serverTime) {
        const t = Number(serverTime);
        if (Number.isFinite(t) && t > 0) this.clockOffset = t - Date.now();
    }

    /** The server forgot everything (reconnect, or the lobby was left): drop the mirror. */
    reset() {
        const removed = [...this.rooms.keys()];
        this.rooms.clear();
        this.recent = [];
        this.counts = { ...EMPTY_COUNTS };
        this.ready = false;
        this.emit({ full: true, added: [], updated: [], removed, reset: true });
    }

    applyState(message) {
        this.alignClock(message.serverTime);
        const next = new Map();
        for (const room of Array.isArray(message.rooms) ? message.rooms : []) if (room && room.id) next.set(room.id, room);
        const added = [], updated = [], removed = [];
        for (const [id, room] of next) {
            if (!this.rooms.has(id)) added.push(id);
            else if (JSON.stringify(this.rooms.get(id)) !== JSON.stringify(room)) updated.push(id);
        }
        for (const id of this.rooms.keys()) if (!next.has(id)) removed.push(id);
        this.rooms = next;
        this.recent = Array.isArray(message.recent) ? message.recent : [];
        this.counts = { ...EMPTY_COUNTS, ...(message.counts || {}) };
        this.ready = true;
        this.emit({ full: true, added, updated, removed });
    }

    applyPatch(message) {
        if (!this.ready) return; // a patch without a base state is meaningless; the next snapshot fixes it
        this.alignClock(message.serverTime);
        const added = [], updated = [], removed = [];
        for (const room of Array.isArray(message.upsert) ? message.upsert : []) {
            if (!room || !room.id) continue;
            (this.rooms.has(room.id) ? updated : added).push(room.id);
            this.rooms.set(room.id, room);
        }
        for (const id of Array.isArray(message.remove) ? message.remove : []) {
            if (this.rooms.delete(id)) removed.push(id);
        }
        if (message.counts) this.counts = { ...EMPTY_COUNTS, ...message.counts };
        if (Array.isArray(message.recent)) this.recent = message.recent;
        this.emit({ full: false, added, updated, removed });
    }

    get(id) { return this.rooms.get(id) || null; }
    findByCode(code) {
        const wanted = String(code || '').toUpperCase();
        for (const room of this.rooms.values()) if (room.code === wanted) return room;
        return null;
    }
    waiting() { return [...this.rooms.values()].filter(isWaiting); }
    live() { return [...this.rooms.values()].filter(room => room.phase === 'playing'); }
    /** Finished races from the last minute or two, newest first. */
    recentRaces(maxAgeMs = 90_000) {
        const cutoff = this.now() - maxAgeMs;
        return this.recent.filter(entry => entry.finishedAt >= cutoff);
    }
}
