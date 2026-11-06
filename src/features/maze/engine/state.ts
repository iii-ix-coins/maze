// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 7, 9, 11, 13, 25, 26, 28, 29, 30, 31, 32, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 63, 64, 65, 66, 67, 68, 69, 70, 86, 92, 144, 145, 154, 161, 165, 169, 179, 181). Only imports/exports and `S.` state access were added.
import { PLAYER_COLOR } from './constants';
import { getGrid, DEFAULT_SIZE, MAX_GOALS } from '@maze/shared';
/** Every reassigned module-level `let` of the legacy file, declared in the original order. */
export const S = (() => {
let WALL_COLOR = '#063b14';
let playerColor = PLAYER_COLOR;
let BOARD_COLOR = '#168b2b';
let activeTheme = 'grass';
// The board size is chosen per game in "Create Your Game" (21 / 33 / 45), so everything that depends
// on it is re-pointed by applyMazeSize() whenever a new game or a saved game is loaded.
let grid = getGrid(DEFAULT_SIZE);
let SIZE = grid.SIZE, N = grid.N, NB = grid.NB;
let open: Uint8Array = new Uint8Array(N);
let startCell = 0;
let exits = [];
let player = 0;
let isGameOver = true;
let V = 640;
let base = 15;
let dpr = 1;
let miniM = 150, miniPad = 5, miniScale = 3;
let wallPath = null, trailPath = null;
let solutionLen = 0, steps = 0, startTime = null, endTime = null;
let hintsLeft = 0, hintsUsed = 0, hint = null;
let drawR = 0, drawC = 0, kickX = 0, kickY = 0, pop = 0;
let fogOn = false, introT = 1;
let exitDists = Array.from({ length: MAX_GOALS }, () => new Int32Array(N));
let goals = 0, goalTotal = 3, pausedAt = null, revealed = false;
let dStart = new Int32Array(N), prevStart = new Int32Array(N);
let moves = '', mazeCode = '';
let selectedPlayerCount = 1, selectedGoalCount = 3, selectedSize = DEFAULT_SIZE;
let multiplayerSession = false;
let multiplayerRoomId = '', localPlayerId = '', multiplayerPlayers = [];
let multiplayerWinnerId = '', multiplayerWinnerName = '';
let goalPingIndex = -1, goalPingAt = 0;
// Spectating: a live race watched from the lobby. The board is the racers', the camera follows one of them.
let spectating = false, spectatorFocus = '', spectatorPinned = false, roomCode = '';
let pinchDist = 0;
let padId = null;
let padPos = { x: 1, y: 1 };
let gripId = null, gripOffX = 0, gripOffY = 0;
let miniId = null;
let resizeTimer = 0;
let lastT = 0;
    return { WALL_COLOR, playerColor, BOARD_COLOR, activeTheme, grid, SIZE, N, NB, open, startCell, exits, player, isGameOver, V, base, dpr, miniM, miniPad, miniScale, wallPath, trailPath, solutionLen, steps, startTime, endTime, hintsLeft, hintsUsed, hint, drawR, drawC, kickX, kickY, pop, fogOn, introT, exitDists, goals, goalTotal, pausedAt, revealed, dStart, prevStart, moves, mazeCode, selectedPlayerCount, selectedGoalCount, selectedSize, multiplayerSession, multiplayerRoomId, localPlayerId, multiplayerPlayers, multiplayerWinnerId, multiplayerWinnerName, goalPingIndex, goalPingAt, spectating, spectatorFocus, spectatorPinned, roomCode, pinchDist, padId, padPos, gripId, gripOffX, gripOffY, miniId, resizeTimer, lastT };
})();
export const cam = { z: 1, cx: S.SIZE / 2, cy: S.SIZE / 2, tz: 1, tcx: S.SIZE / 2, tcy: S.SIZE / 2, follow: true, anchor: null };
export const confetti = [];
export const collected = new Uint8Array(MAX_GOALS);
export const reveal = [];
export const racerPos = new Map();
export const padVec = { x: 0, y: 0 };
export const hudCache: Record<string, any> = {};
export const ptrs = new Map();
