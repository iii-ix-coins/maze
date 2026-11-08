// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132). Only imports/exports and `S.` state access were added.
import { createGame, lobbyHub, multiplayerClient, raceBoard } from './services';
import { S, racerPos, cam, collected } from './state';
import { reduceMotion } from './dom';
import { initGame, resetUi, beginScene, burst } from './solo';
import { generateMazeData, DC, DR } from '@maze/shared';
import { applyMazeSize } from './layout';
import { showMenu } from './session';
import { PLAYER_COLOR } from './constants';
import { updateHud, fmtTime } from './hud';
import { showMazeResult, showMazeBanner } from '../ui/maze-view-store';
import { rankPlayers } from '../ui/race-board';
import { ensurePlayerVisible } from './camera';
export function getMultiplayerUrl() {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="maze-multiplayer-url"]');
    const configured = meta ? meta.content.trim() : '';
    if (configured) return configured;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return '';
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${location.host}`;
}
export function handleNetworkStatus(state, message) {
    createGame.setNetworkStatus(state, message);
    lobbyHub.onNetwork(state);
    if (state === 'offline' && S.multiplayerSession) {
        // The server forgets a racer whose connection closed, so a race cannot be resumed after reconnecting.
        S.isGameOver = true;
        showMazeBanner(S.spectating
            ? 'Connection lost — this race can no longer be watched. Go back to the lobby to pick another.'
            : 'Connection lost — this race can no longer sync. Return to the lobby to start a new match.');
    }
}
/** Called by "Create Your Game" once the player has held the launch button. */
export function launchGame({ size, players, goals: goalsWanted, name, separate }) {
    S.selectedSize = size;
    S.selectedPlayerCount = players;
    S.selectedGoalCount = goalsWanted;
    if (players <= 1) {
        initGame(goalsWanted, size);
        return;
    }
    // Online: the lobby finds a room with this exact set-up (or opens one) and keeps the player in it.
    lobbyHub.quickMatch({ size, players, goals: goalsWanted, name: name || 'Player', separate: !!separate });
    return 'stay';
}
export function handleLobbyCounts(counts) {
    createGame.updateLobbyCounts(counts || {});
}
/** The server picked this player to build the shared maze. It happens silently while the room screen stays up. */
export function prepareHostedMaze(message) {
    try {
        const generated = generateMazeData(Number(message.goals), Number(message.size));
        const accepted = multiplayerClient.publishMaze({
            maze: Array.from(generated.open, v => v.toString(16)).join(''),
            start: generated.startCell,
            exits: Array.from(generated.exits)
        });
        if (!accepted) lobbyHub.notice('The shared maze could not be sent. Leave the room and try again.', { tone: 'warn' });
    } catch (error) {
        console.error('Could not build the shared maze:', error);
        lobbyHub.notice('The shared maze could not be built. Leave the room and try again.', { tone: 'warn' });
    }
}
/** Puts a maze from the server on screen. Returns false (touching nothing) when the data is not usable. */
export function loadSharedMaze(map, sizeHint, goalCount) {
    const mapSize = Number(sizeHint) || Number(map && map.size) || 0;
    if (!map || !Number.isInteger(mapSize) || mapSize < 8 || mapSize > 64) return false;
    if (typeof map.maze !== 'string' || map.maze.length !== mapSize * mapSize || !Array.isArray(map.exits)) return false;
    applyMazeSize(mapSize);
    resetUi();
    S.open = Uint8Array.from(map.maze, (c: any) => parseInt(c, 16));
    S.startCell = Number(map.start);
    S.exits = map.exits.slice();
    S.goalTotal = goalCount || S.exits.length;
    S.selectedSize = S.SIZE;
    beginScene();
    return true;
}
export function roomLabel(watchers = 0) {
    raceBoard.setRoomCode(`ROOM ${S.roomCode}${watchers > 0 ? ` · ${watchers} watching` : ''}`);
}
export function startMultiplayerGame(message) {
    const map = message.maze;
    const goalCount = Number(message.goalCount || (map && map.goalCount) || (map && Array.isArray(map.exits) ? map.exits.length : 0));
    S.spectating = false;
    if (!loadSharedMaze(map, map && map.size, goalCount)) {
        multiplayerClient.leaveRoom();
        showMenu();
        lobbyHub.notice('This race could not be loaded. Please try another room.', { tone: 'warn' });
        return;
    }
    S.multiplayerSession = true;
    S.multiplayerRoomId = message.roomId || '';
    S.roomCode = String(message.code || '');
    S.localPlayerId = message.ownPlayerId || '';
    S.selectedGoalCount = S.goalTotal;
    S.multiplayerWinnerId = '';
    S.multiplayerWinnerName = '';
    S.multiplayerPlayers = Array.isArray(message.players) ? message.players : [];
    S.selectedPlayerCount = S.multiplayerPlayers.length || S.selectedPlayerCount;
    S.playerColor = S.multiplayerPlayers.find(item => item.id === S.localPlayerId)?.color || PLAYER_COLOR;
    racerPos.clear();
    S.startTime = performance.now() - Math.max(0, Date.now() - Number(message.startedAt || Date.now()));
    S.endTime = null;
    roomLabel();
    raceBoard.render(S.multiplayerPlayers, S.localPlayerId, S.goalTotal);
    lobbyHub.gameStarted();
    updateHud();
}
/** A spectator's view: every racer is drawn, the camera follows one of them (the leader unless one is picked). */
export function startSpectating(message) {
    const map = message.maze;
    const goalCount = Number(message.goalCount || (map && Array.isArray(map.exits) ? map.exits.length : 0));
    S.spectating = true; // before the maze loads, so the labels switch with it
    if (!loadSharedMaze(map, message.size || (map && map.size), goalCount)) {
        S.spectating = false;
        multiplayerClient.leaveSpectate();
        lobbyHub.notice('This race could not be loaded. Please try another race.', { tone: 'warn' });
        return;
    }
    S.multiplayerSession = true;
    S.multiplayerRoomId = message.roomId || '';
    S.roomCode = String(message.code || '');
    S.localPlayerId = '';
    S.multiplayerWinnerId = '';
    S.multiplayerWinnerName = '';
    S.multiplayerPlayers = Array.isArray(message.players) ? message.players : [];
    S.playerColor = PLAYER_COLOR;
    S.isGameOver = true; // nobody moves from here; it also keeps the "leave page?" prompt quiet
    racerPos.clear();
    S.spectatorFocus = '';
    S.spectatorPinned = false;
    S.startTime = performance.now() - Math.max(0, Date.now() - Number(message.startedAt || Date.now()));
    S.endTime = null;
    chooseFocus();
    roomLabel(Number(message.spectators) || 0);
    raceBoard.render(S.multiplayerPlayers, '', S.goalTotal, S.spectatorFocus);
    lobbyHub.gameStarted();
    updateHud();
}
/** Keeps the camera on the picked racer, or on whoever leads; the lead only changes hands on a clear gain. */
export function chooseFocus() {
    const present = S.multiplayerPlayers.filter(p => p.connected !== false);
    const current = present.find(p => p.id === S.spectatorFocus);
    const leader = rankPlayers(present)[0];
    if (!current) {
        S.spectatorFocus = leader ? leader.id : '';
        S.spectatorPinned = false;
    } else if (!S.spectatorPinned && leader && leader.id !== current.id
        && (leader.finished || Number(leader.goals) > Number(current.goals))) {
        S.spectatorFocus = leader.id;
    }
    const focused = present.find(p => p.id === S.spectatorFocus);
    if (focused) {
        S.player = Number(focused.position);
        S.steps = Number(focused.steps) || 0;
        S.goals = Number(focused.goals) || 0;
        syncCollected();
    }
}
/** A click on the standings: follow that racer; click the same one again to go back to the leader. */
export function pickRacer(id) {
    if (!S.spectating || !id) return;
    if (id === S.spectatorFocus && S.spectatorPinned) { S.spectatorPinned = false; S.spectatorFocus = ''; }
    else { S.spectatorFocus = id; S.spectatorPinned = true; }
    chooseFocus();
    cam.follow = true;
    cam.anchor = null;
    raceBoard.render(S.multiplayerPlayers, S.localPlayerId, S.goalTotal, S.spectatorFocus);
    updateHud();
}
/** Targets are collected strictly in order, so the first `goals` flags are set. */
export function syncCollected() {
    for (let i = 0; i < collected.length; i++) collected[i] = i < S.goals ? 1 : 0;
}
export function applyMultiplayerUpdate(message) {
    if (!S.multiplayerSession || !Array.isArray(message.players)) return;
    S.multiplayerPlayers = message.players;
    roomLabel(Number(message.spectators) || 0);
    if (S.spectating) {
        chooseFocus();
        raceBoard.render(S.multiplayerPlayers, '', S.goalTotal, S.spectatorFocus);
        updateHud();
        return;
    }
    const me = S.multiplayerPlayers.find(item => item.id === S.localPlayerId);
    if (me) {
        const oldGoals = S.goals;
        S.player = Number(me.position);
        S.steps = Number(me.steps) || 0;
        S.goals = Number(me.goals) || 0;
        syncCollected();
        if (message.lastMove && message.lastMove.id === S.localPlayerId) {
            S.trailPath.lineTo((S.player % S.SIZE) + 0.5, ((S.player / S.SIZE) | 0) + 0.5);
            ensurePlayerVisible();
            S.pop = 1;
            if (S.goals > oldGoals) {
                S.goalPingIndex = S.goals < S.goalTotal ? S.goals : -1;
                S.goalPingAt = performance.now();
                if (!reduceMotion) burst(S.player, 30);
            }
        }
    }
    raceBoard.render(S.multiplayerPlayers, S.localPlayerId, S.goalTotal);
    updateHud();
}
export function finishMultiplayerGame(message) {
    if (!S.multiplayerSession) return;
    if (Array.isArray(message.players)) {
        S.multiplayerPlayers = message.players;
        // Watchers see the winner's numbers on the result card; racers see their own.
        if (S.spectating && message.winnerId) { S.spectatorFocus = message.winnerId; S.spectatorPinned = true; }
        const subject = S.multiplayerPlayers.find(item => item.id === (S.spectating ? message.winnerId : S.localPlayerId));
        if (subject) {
            S.player = Number(subject.position);
            S.steps = Number(subject.steps) || S.steps;
            S.goals = Number(subject.goals) || S.goals;
            syncCollected();
        }
    }
    S.multiplayerWinnerId = message.winnerId || '';
    S.multiplayerWinnerName = message.winnerName || 'Another racer';
    S.isGameOver = true;
    S.endTime = performance.now();
    S.pausedAt = null;
    const winMessage = !S.spectating && S.multiplayerWinnerId === S.localPlayerId
        ? '🏆 You win!'
        : `🏁 ${S.multiplayerWinnerName} wins`;
    showMazeResult(winMessage, [
        { value: S.steps, label: 'Steps' },
        { value: `${S.goals}/${S.goalTotal}`, label: 'Targets' },
        { value: fmtTime(Math.max(0, S.endTime - (S.startTime || S.endTime))), label: 'Time' },
    ]);
    raceBoard.render(S.multiplayerPlayers, S.localPlayerId, S.goalTotal, S.spectating ? S.spectatorFocus : '');
    if (!reduceMotion) {
        const mine = !S.spectating && S.multiplayerWinnerId === S.localPlayerId;
        burst(S.player, mine ? 100 : 32);
        if (mine) setTimeout(() => burst(S.player, 70), 320);
    }
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    updateHud();
}
export function handleMultiplayerMessage(message) {
    if (!message || typeof message.type !== 'string') return;
    // Lobby traffic (rooms, live feed, thumbnails, waiting-room state) belongs to the lobby.
    if (lobbyHub.handleMessage(message)) return;
    switch (message.type) {
        case 'lobby:counts':
            handleLobbyCounts(message.counts || {});
            break;
        case 'room:host':
            prepareHostedMaze(message);
            break;
        case 'game:start':
            startMultiplayerGame(message);
            break;
        case 'spectate:start':
            startSpectating(message);
            break;
        case 'room:update':
            if (message.roomId === S.multiplayerRoomId) applyMultiplayerUpdate(message);
            break;
        case 'player:blocked': {
            const direction = Number(message.direction);
            if (direction >= 0 && direction < 4) {
                S.kickX = DC[direction] * 0.14;
                S.kickY = DR[direction] * 0.14;
            }
            break;
        }
        case 'game:finish':
            if (message.roomId === S.multiplayerRoomId) finishMultiplayerGame(message);
            break;
        case 'room:closed':
            // The room vanished under a running race (everybody else left, or the host failed).
            if (S.multiplayerSession && !S.spectating && !S.multiplayerWinnerId && (!message.roomId || message.roomId === S.multiplayerRoomId)) {
                S.isGameOver = true;
                showMazeBanner(String(message.message || 'This room closed.') + ' Go back to the lobby to start another.');
            }
            break;
        case 'spectate:ended':
            // A finished race stays on screen for as long as the viewer reads the result.
            if (S.spectating && !S.multiplayerWinnerId && (!message.roomId || message.roomId === S.multiplayerRoomId)) {
                showMenu();
                lobbyHub.notice(String(message.message || 'That race has ended.'));
            }
            break;
        case 'room:left':
            if (!message.roomId || message.roomId === S.multiplayerRoomId) S.multiplayerRoomId = '';
            break;
        case 'spectate:left':
        case 'queue:left':
            break;
        case 'match:error':
        case 'protocol:error': {
            const text = String(message.message || 'Multiplayer error');
            if (createGame.visible) lobbyHub.notice(text, { tone: 'warn' });
            else showMazeBanner(text);
            break;
        }
        default:
            break;
    }
}

export function initLegacyUrlCleanup() {

/* ──────────────────────────────────────────────────────────────────────────
   Lobby orchestration. Components own rendering; this layer connects them to
   game state and the independently hosted room server.
   ────────────────────────────────────────────────────────────────────────── */
// Runs once when the page loads: an address typed by hand in an old version must never win over the automatic one.
try { localStorage.removeItem('mazeMultiplayerUrl'); } catch (_) { }
}
