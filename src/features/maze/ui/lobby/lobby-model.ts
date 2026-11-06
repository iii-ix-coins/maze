/**
 * Pure lobby helpers: seat layouts, filtering, sorting and formatting.
 * No DOM in here, so everything can be unit-tested in Node.
 */
import { DIFFICULTIES } from '@maze/shared';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RING_MAX = 12;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Where each seat sits inside the unit disc (x, y in -1..1) and how big a seat is (also in disc units).
 * Up to 12 seats form a ring that fills clockwise from the top. Bigger rooms bloom like a sunflower: seat 0 is in
 * the middle and later seats spiral outwards, so 99 seats still read as a tidy flower and a new racer "opens" the
 * next petal.
 */
export function seatLayout(capacity) {
    const n = Math.max(1, Math.floor(Number(capacity) || 1));
    const points = [];
    if (n === 1) return { points: [{ x: 0, y: 0 }], radius: 0.3 };
    if (n <= RING_MAX) {
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
            points.push({ x: Math.cos(a) * 0.74, y: Math.sin(a) * 0.74 });
        }
        const radius = clamp(Math.sin(Math.PI / n) * 0.74 * 0.78, 0.07, 0.24);
        return { points, radius };
    }
    // Sunflower seeds sit about 1.9·R / sqrt(n) apart inside a disc of radius R; pick R so the outermost seed still fits.
    const reach = 1 / (1 + 0.855 / Math.sqrt(n));
    for (let i = 0; i < n; i++) {
        const r = Math.sqrt((i + 0.5) / n) * reach;
        const a = i * GOLDEN_ANGLE;
        points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return { points, radius: clamp(0.75 * reach / Math.sqrt(n), 0.05, 0.22) };
}

/**
 * Seat colours. A seat keeps its colour for as long as the room lives; this must stay identical to `playerColor`
 * in server/server.js (a test compares the two).
 */
export const SEAT_PALETTE = Object.freeze([
    '#36b8ff', '#ffc857', '#4dd4ac', '#bd8cff', '#ff8a45',
    '#6de0eb', '#f48fb1', '#b5e36b', '#d0d7de', '#e879f9'
]);
export function seatColor(index) {
    const i = Math.max(0, Math.floor(Number(index) || 0));
    return i < SEAT_PALETTE.length ? SEAT_PALETTE[i] : `hsl(${Math.round((i * 137.508) % 360)}, 72%, 64%)`;
}

/**
 * Wall segments of a maze given as the server's hex string (one digit per cell; bit d set = open towards
 * direction d, 0=up 1=right 2=down 3=left). Returns a flat [x1, y1, x2, y2, …] list in cell units, with straight
 * runs merged so a 45×45 board needs only a few hundred strokes.
 */
export function wallSegments(maze, size) {
    const out = [];
    const open = i => parseInt(maze[i], 16) || 0;
    for (let r = 0; r <= size; r++) {
        let run = -1;
        for (let c = 0; c <= size; c++) {
            const wall = c < size && (r === 0 || r === size || !(open((r - 1) * size + c) & 4));
            if (wall && run < 0) run = c;
            if (!wall && run >= 0) { out.push(run, r, c, r); run = -1; }
        }
    }
    for (let c = 0; c <= size; c++) {
        let run = -1;
        for (let r = 0; r <= size; r++) {
            const wall = r < size && (c === 0 || c === size || !(open(r * size + c - 1) & 2));
            if (wall && run < 0) run = r;
            if (!wall && run >= 0) { out.push(c, run, c, r); run = -1; }
        }
    }
    return out;
}

/** "Easy" / "Medium" / "Hard" for a board size. */
export function levelOf(size) {
    const index = DIFFICULTIES.findIndex(level => level.size === Number(size));
    return index < 0 ? { index: 1, label: `${size}×${size}`, size: Number(size) } : { index, label: DIFFICULTIES[index].label, size: DIFFICULTIES[index].size };
}

/** 72 → "1:12", 3725 → "1:02:05". Negative or invalid input reads as 0:00. */
export function formatClock(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

/** "just now", "42s", "3 min", "1 h 05 min": a relaxed way to say how long a room has been waiting. */
export function formatAge(ms) {
    const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export const seatsLeft = room => Math.max(0, (Number(room.capacity) || 0) - (Number(room.count) || 0));
export const fillRatio = room => clamp((Number(room.count) || 0) / Math.max(1, Number(room.capacity) || 1), 0, 1);
export const liveProgress = room => {
    const goals = Math.max(1, Number(room.goals) || 1);
    return clamp((room.leader ? Number(room.leader.goals) || 0 : 0) / goals, 0, 1);
};

/** Mood of a waiting room, used for colour and wording: "fresh", "warm" (half full) or "hot" (one seat away). */
export function roomHeat(room) {
    const left = seatsLeft(room);
    if (left <= 1) return 'hot';
    return fillRatio(room) >= 0.5 ? 'warm' : 'fresh';
}

/**
 * Filters a room list. `sizes` is a Set of board sizes (empty = all), `query` matches the code, the host or any
 * listed player (case-insensitive), `openOnly` hides rooms that can no longer be joined.
 */
export function filterRooms(list, { sizes = null, query = '', openOnly = false } = {}) {
    const q = String(query || '').trim().toLowerCase();
    return list.filter(room => {
        if (sizes && sizes.size && !sizes.has(room.size)) return false;
        if (openOnly && (room.phase !== 'waiting' || seatsLeft(room) <= 0)) return false;
        if (!q) return true;
        const haystack = [room.code, room.host, ...(room.names || []), room.leader ? room.leader.name : '']
            .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
    });
}

const byOldest = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);
const WAITING_SORTS = {
    // Closest to starting first: the room that needs the fewest racers, ties by how long it has waited.
    fill: (a, b) => seatsLeft(a) - seatsLeft(b) || byOldest(a, b),
    newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    biggest: (a, b) => (b.capacity || 0) - (a.capacity || 0) || seatsLeft(a) - seatsLeft(b) || byOldest(a, b)
};
const LIVE_SORTS = {
    // The tightest finish first.
    close: (a, b) => liveProgress(b) - liveProgress(a) || (b.count || 0) - (a.count || 0),
    crowd: (a, b) => (b.count || 0) - (a.count || 0) || liveProgress(b) - liveProgress(a),
    watched: (a, b) => (b.spectators || 0) - (a.spectators || 0) || liveProgress(b) - liveProgress(a),
    newest: (a, b) => (b.startedAt || 0) - (a.startedAt || 0)
};
export const WAITING_SORT_MODES = Object.keys(WAITING_SORTS);
export const LIVE_SORT_MODES = Object.keys(LIVE_SORTS);
/** Returns a new, sorted array. Rooms that are already starting sink below open ones. */
export function sortWaiting(list, mode = 'fill') {
    const compare = WAITING_SORTS[mode] || WAITING_SORTS.fill;
    return [...list].sort((a, b) => ((a.phase === 'preparing') as any) - ((b.phase === 'preparing') as any) || compare(a, b) || (a.id < b.id ? -1 : 1));
}
export function sortLive(list, mode = 'close') {
    const compare = LIVE_SORTS[mode] || LIVE_SORTS.close;
    return [...list].sort((a, b) => compare(a, b) || (a.id < b.id ? -1 : 1));
}

/** True when two room summaries would look the same on a card (used to skip pointless repaints). */
export function sameRoom(a, b) {
    if (!a || !b) return false;
    return a.phase === b.phase && a.count === b.count && a.capacity === b.capacity && a.host === b.host &&
        a.spectators === b.spectators && a.seats?.join() === b.seats?.join() &&
        (a.leader ? a.leader.name + a.leader.goals : '') === (b.leader ? b.leader.name + b.leader.goals : '');
}

/** Normalises what a person typed into the "join by code" field. */
export function cleanCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[IO]/g, '').slice(0, 6);
}
