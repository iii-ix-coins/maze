// Moved verbatim from legacy/mazeV3/server/server.js (statements 6, 7, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 52, 53). Only imports/exports and `S.` state access were added.
import { MAZE_SIZES, MIN_GOALS, MAX_GOALS, MAX_PLAYERS } from '@maze/shared';
import path from 'node:path';
import fs from 'node:fs';

export const PORT = Number(process.env.MAZE_PORT || 8081);
export const HOST = process.env.HOST || '0.0.0.0';
// When run from the full repository, serve the web app and WebSocket endpoint from
// one local origin. On a deployment whose root directory is `server/`, fall back to
// API/WebSocket-only mode because the front-end files are not part of that directory.
export const FRONTEND_CANDIDATE = path.resolve(__dirname, '../../dist/site');
export const FRONTEND_ROOT = fs.existsSync(path.join(FRONTEND_CANDIDATE, 'index.html'))
    ? FRONTEND_CANDIDATE
    : null;
export const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon'
};
export const envMs = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};
export const SHUTDOWN_TIMEOUT_MS = envMs('MAZE_SHUTDOWN_TIMEOUT_MS', 10_000);
export const MAX_CONNECTIONS = Math.floor(envMs('MAZE_MAX_CONNECTIONS', 2_000));
export const MAX_CONNECTIONS_PER_IP = Math.floor(envMs('MAZE_MAX_CONNECTIONS_PER_IP', 100));

/* ── Deployment awareness ──────────────────────────────────────────────────
   One rule: an explicit MAZE_* variable always wins; otherwise the server works
   out its own surroundings, so the same code runs locally, on Railway, or elsewhere.
   ───────────────────────────────────────────────────────────────────────── */
export const envFlag = (name, auto) => {
    const raw = String(process.env[name] || '').trim().toLowerCase();
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return auto;
};
export const ON_RAILWAY = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PUBLIC_DOMAIN);
export const PLATFORM = ON_RAILWAY ? 'railway' : (process.env.NODE_ENV === 'production' ? 'production' : 'local');
export const TRUST_PROXY = envFlag('MAZE_TRUST_PROXY', ON_RAILWAY);
export const ALLOWED_ORIGINS = new Set((process.env.MAZE_ALLOWED_ORIGINS || '')
    .split(',').map(v => v.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean));
export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const PROTOCOL_VERSION = 2;
// "Create Your Game" limits. The board sizes and the goal/player ceilings come from the shared package, the one
// definition the web client uses too (they used to be duplicated here with a "must match" comment).
export const VALID_SIZES = new Set(MAZE_SIZES);
export { MIN_GOALS, MAX_GOALS, MAX_PLAYERS };
export const MIN_PLAYERS = 2;
 // one player is a local Free Play run and never reaches the server
export const MAX_ROOMS = 400;
export const MAX_SPECTATORS_PER_ROOM = 300;
export const MAX_PEEKS = 12;
export const ROOM_RETENTION_MS = envMs('MAZE_ROOM_RETENTION_MS', 3 * 60 * 1000);
export const PREPARE_TIMEOUT_MS = envMs('MAZE_PREPARE_TIMEOUT_MS', 20 * 1000);
export const WAITING_ROOM_TTL_MS = envMs('MAZE_WAITING_TTL_MS', 45 * 60 * 1000);
export const RECENT_MAX = 12;
export const RECENT_TTL_MS = 90 * 1000;
export const LOBBY_FLUSH_MS = envMs('MAZE_LOBBY_FLUSH_MS', 250);
export const PEEK_TICK_MS = 250;
export const HOUSEKEEPING_MS = 5 * 1000;
export const HEARTBEAT_MS = envMs('MAZE_HEARTBEAT_MS', 25 * 1000);
// A slow client must not make the server buffer an unbounded lobby backlog for it.
export const BACKPRESSURE_BYTES = 512 * 1024;
// A racer whose socket has stopped draining entirely is cut loose rather than buffered without limit.
export const HARD_BUFFER_BYTES = 8 * 1024 * 1024;
// Cheap flood guard: a token bucket per connection (a key-repeat joystick sends well under 60 moves/s).
export const RATE_BURST = 160;
export const RATE_PER_MS = 0.12;
// Big rooms would otherwise fan out every single move to every racer (players² messages).
// Above this size only the mover gets an immediate confirmation; everyone else is served
// from a coalesced snapshot. Spectators always read from coalesced snapshots.
export const LARGE_ROOM_PLAYERS = 12;
export const LARGE_ROOM_FLUSH_MIN_MS = 100;
export const LARGE_ROOM_FLUSH_MAX_MS = 400;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 // no I, O, 0, 1
export const PALETTE = [
    '#36b8ff', '#ffc857', '#4dd4ac', '#bd8cff', '#ff8a45',
    '#6de0eb', '#f48fb1', '#b5e36b', '#d0d7de', '#e879f9'
];
