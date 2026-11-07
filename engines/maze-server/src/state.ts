// Moved verbatim from legacy/mazeV3/server/server.js (statements 8, 9, 10, 11, 12, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67). Only imports/exports, `S.` state access and type annotations were added.
/** Every reassigned module-level `let` of the legacy file, declared in the original order. */
export const S = (() => {
let shuttingDown = false;
let shutdownPromise = null as Promise<void> | null;
let nextPlayerNumber = 1;
let recentDirty = false;
let countsDirty = false;
let lobbyTimer = null as NodeJS.Timeout | null;
let lobbyStateCache = null as { at: number; json: string } | null;
    return { shuttingDown, shutdownPromise, nextPlayerNumber, recentDirty, countsDirty, lobbyTimer, lobbyStateCache };
})();
export const connectionsByIp = new Map<any, any>();
export const intervalHandles: any[] = [];
export const activeHttpResponses = new Set<any>();

/* ── State ─────────────────────────────────────────────────────────────── */
export const clients = new Map<any, any>();        // peer id → peer
export const rooms = new Map<any, any>();          // room id → room
export const roomsByCode = new Map<any, any>();    // "K7QF" → room
export const lobbyWatchers = new Set<any>();  // peers receiving lobby traffic
export const peekRooms = new Set<any>();      // running rooms somebody is looking at
export const recentFinished: any[] = [];        // newest first

export const dirtyRooms = new Set<any>();
export const removedRooms = new Set<any>();
