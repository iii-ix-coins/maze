/**
 * Shapes of the data that travels between the server and the web client (WebSocket protocol v2).
 * They describe the messages exactly as they are today; Phase 2 (binary protocol) will replace the transport
 * but these entities stay the vocabulary of the game.
 */
export type Direction = 0 | 1 | 2 | 3;
export type RoomPhase = 'waiting' | 'preparing' | 'playing' | 'finished';

/** What the host sends with `maze:publish`. `maze` holds one hex digit (wall bit mask) per cell. */
export interface MazePayload {
    maze: string;
    start: number;
    exits: number[];
}
/** The maze as the server stores it and sends it back in `game:start` / `spectate:start`. */
export interface RoomMaze extends MazePayload {
    goalCount: number;
    size: number;
}
export interface PublicPlayer {
    id: string;
    name: string;
    color: string;
    position: number;
    steps: number;
    goals: number;
    finished: boolean;
    connected: boolean;
}
export interface RoomMember {
    id: string;
    name: string;
    color: string;
    seat: number;
    host: boolean;
}
export interface RoomState {
    id: string;
    code: string;
    phase: RoomPhase;
    size: number;
    goals: number;
    capacity: number;
    hostId: string;
    createdAt: number;
    minStart: number;
    members: RoomMember[];
}
export interface RoomLeader {
    name: string;
    color: string;
    goals: number;
}
export interface RoomSummary {
    id: string;
    code: string;
    phase: RoomPhase;
    size: number;
    goals: number;
    capacity: number;
    count: number;
    host: string;
    createdAt: number;
    spectators: number;
    startedAt?: number | null;
    racers?: number;
    leader?: RoomLeader | null;
    seats?: number[];
    names?: string[];
}
export interface RecentEntry {
    id: string;
    code: string;
    size: number;
    goals: number;
    winner: string;
    winnerColor: string;
    racers: number;
    durationMs: number;
    finishedAt: number;
}
export interface LobbyCounts {
    waitingByMode: Record<string, number>;
    onlinePlayers: number;
    waitingPlayers: number;
    waitingRooms: number;
    liveRooms: number;
    livePlayers: number;
    spectators: number;
    activeRooms: number;
}
export interface LastMove {
    id: string;
    direction: number;
    from: number;
    to: number;
    collectedGoal: number | null;
}
/**
 * Envelope of every message. The payload fields differ per `type` (see the header of engines/maze-server/src/server.ts);
 * they are read defensively on both sides, exactly as before, so they stay loosely typed in Phase 1.
 */
export interface WireMessage {
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [field: string]: any;
}
