/**
 * Race standings model/controller. It deliberately contains no DOM operations:
 * the React RaceBoardView subscribes to raceBoardStore and renders the rows.
 */
export type RacePlayer = {
    id: string;
    name?: string;
    color?: string;
    connected?: boolean;
    finished?: boolean;
    goals?: number;
    steps?: number;
    position?: number;
};

export function rankPlayers(players: RacePlayer[] = []): RacePlayer[] {
    return [...players].sort((a, b) =>
        Number(b.finished) - Number(a.finished) ||
        (Number(b.goals) - Number(a.goals)) ||
        (Number(a.steps) - Number(b.steps))
    );
}

export type RaceBoardRow = {
    id: string;
    place: string;
    name: string;
    color: string;
    status: string;
    steps: number;
    isYou: boolean;
    isFocus: boolean;
    isFinished: boolean;
};

export type RaceBoardSnapshot = {
    visible: boolean;
    picking: boolean;
    heading: string;
    roomCode: string;
    crowd: number;
    rows: RaceBoardRow[];
    hiddenCount: number;
};

const initialSnapshot: RaceBoardSnapshot = {
    visible: false,
    picking: false,
    heading: 'LIVE RACE',
    roomCode: '',
    crowd: 0,
    rows: [],
    hiddenCount: 0,
};

let snapshot = initialSnapshot;
let onPick: ((id: string) => void) | null = null;
const listeners = new Set<() => void>();

export const raceBoardStore = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    select: (id: string) => {
        if (snapshot.picking && id) onPick?.(id);
    },
};

function publish(next: RaceBoardSnapshot) {
    const keys = Object.keys(next) as (keyof RaceBoardSnapshot)[];
    if (keys.every(key => Object.is(snapshot[key], next[key]))) return;
    snapshot = next;
    listeners.forEach(listener => listener());
}

/** Stable API used by the legacy engine call sites, backed entirely by data. */
export class RaceBoardComponent {
    static MAX_ROWS = 8;

    constructor({ onPick: pick = null }: { onPick?: ((id: string) => void) | null } = {}) {
        onPick = pick;
    }

    show() {
        publish({ ...snapshot, visible: true });
    }

    hide() {
        publish({ ...snapshot, visible: false, picking: false });
    }

    setHeading(heading: string) {
        publish({ ...snapshot, heading });
    }

    setRoomCode(roomCode: string) {
        publish({ ...snapshot, roomCode });
    }

    /**
     * Racers of interest (the local player or followed spectator target) remain
     * visible even if their rank falls below the eight-row display cutoff.
     */
    render(players: RacePlayer[] = [], ownId = '', goalTotal = 3, focusId = '') {
        const ranked = rankPlayers(players);
        const max = RaceBoardComponent.MAX_ROWS;
        const pins = [ownId, focusId]
            .filter((id, i, all) => id && all.indexOf(id) === i)
            .map(id => ranked.findIndex(item => item.id === id))
            .filter(rank => rank >= max)
            .sort((a, b) => a - b);
        const visible = ranked.slice(0, max - pins.length);
        for (const rank of pins) visible.push(ranked[rank]);
        const picking = Boolean(onPick) && !ownId;
        const rows = visible.map(player => {
            const rank = ranked.indexOf(player);
            return {
                id: String(player.id),
                place: String(rank + 1).padStart(2, '0'),
                name: player.name || 'Player',
                color: player.color || '#44d17c',
                status: player.connected === false
                    ? 'Disconnected'
                    : (player.finished ? 'Finished' : `${Number(player.goals) || 0}/${goalTotal} targets`),
                steps: Number(player.steps) || 0,
                isYou: player.id === ownId,
                isFocus: Boolean(focusId && player.id === focusId),
                isFinished: Boolean(player.finished),
            };
        });
        publish({
            ...snapshot,
            visible: true,
            picking,
            crowd: ranked.length,
            rows,
            hiddenCount: Math.max(0, ranked.length - visible.length),
        });
    }
}
