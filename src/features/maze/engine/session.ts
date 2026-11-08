// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 105, 106, 107, 108, 109, 110, 111, 112). Only imports/exports and `S.` state access were added.
import { S, racerPos, cam } from './state';
import { multiplayerClient, raceBoard, createGame, lobbyHub } from './services';
import { saveGame, clearSave, buildReveal } from './solo';
import { updateHud } from './hud';
import { hideMazeResult, setNewMazeButtonLabel, hideMazeBanner, showMazeBanner, setMazeConfirmContent, showMazeConfirm, hideMazeConfirm } from '../ui/maze-view-store';
export function setConfirm(resume) {
    if (resume) {
        setMazeConfirmContent('Unfinished game found', 'You left a game in progress. Continue it, or end it and see the shortest paths?');
    } else if (S.multiplayerSession) {
        setMazeConfirmContent('Leave this race?', 'Your racer will leave the live match. Other connected players can continue the race.');
    } else {
        setMazeConfirmContent('End current game?', 'The game will stop and the shortest paths from the start to every point will be shown.');
    }
}
/** Leaves whatever online session is running (a race or a spectator seat) and forgets its state. */
export function leaveOnlineSession() {
    if (S.spectating) multiplayerClient.leaveSpectate();
    else if (S.multiplayerSession) multiplayerClient.leaveRoom();
    S.multiplayerSession = false;
    S.spectating = false;
    S.spectatorFocus = '';
    S.spectatorPinned = false;
    S.roomCode = '';
    S.multiplayerRoomId = '';
    S.localPlayerId = '';
    S.multiplayerPlayers = [];
    S.multiplayerWinnerId = '';
    S.multiplayerWinnerName = '';
    racerPos.clear();
    raceBoard.hide();
    syncRoleUi();
}
/** Words that depend on whether you race or only watch. */
export function syncRoleUi() {
    const label = S.spectating ? 'Back to lobby' : 'New Maze';
    setNewMazeButtonLabel(label);
    raceBoard.setHeading(S.spectating ? 'WATCHING' : 'LIVE RACE');
    document.body.classList.toggle('spectating', S.spectating);
}
export function showMenu() {
    leaveOnlineSession();
    hideMazeResult();
    hideMazeBanner();
    hideMazeConfirm();
    createGame.show();
    lobbyHub.menuShown();
}
export function askEnd() {
    if (S.isGameOver) return;
    setConfirm(false);
    if (S.pausedAt === null) S.pausedAt = performance.now();
    showMazeConfirm();
}
export function cancelEnd() {
    if (S.pausedAt !== null && S.startTime !== null) S.startTime += performance.now() - S.pausedAt;
    S.pausedAt = null;
    hideMazeConfirm();
    saveGame();
}
export function confirmEnd() {
    hideMazeConfirm();
    S.isGameOver = true;
    // Ending a race must not erase a previously saved solo run or reveal its map as a solo result.
    if (S.multiplayerSession) {
        S.pausedAt = null;
        showMenu();
        return;
    }
    clearSave();
    S.endTime = S.pausedAt !== null ? S.pausedAt : performance.now();
    S.pausedAt = null;
    buildReveal();
    S.revealed = true;
    showMazeBanner('Game ended – shortest paths from the start to every point');
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    updateHud();
}
export function newMaze() {
    if (S.isGameOver) showMenu(); else askEnd();
}
