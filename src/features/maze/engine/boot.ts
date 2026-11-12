// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 174, 175, 176, 177, 178, 180, 183, 184, 185). Only imports/exports and `S.` state access were added.
import { $ } from './dom';
import { newMaze, confirmEnd, cancelEnd, showMenu } from './session';
import { S } from './state';
import { fitLayout } from './layout';
import { saveGame, loadSave, restoreGame } from './solo';
import { getMultiplayerUrl, handleNetworkStatus } from './online';
import { cleanCode } from '../ui/lobby/lobby-model';
import { multiplayerClient, lobbyHub } from './services';
import { frame } from './frame';

export function initButtons() {
    $('newMazeWin').addEventListener('click', newMaze);
    $('newMazePanel').addEventListener('click', newMaze);
    $('endYes').addEventListener('click', confirmEnd);
    $('endNo').addEventListener('click', cancelEnd);
}

export function initWindowEvents() {
    window.addEventListener('beforeunload', (e) => {
        if (!S.isGameOver) { e.preventDefault(); e.returnValue = ''; }
    });
    window.addEventListener('resize', () => {
        window.clearTimeout(S.resizeTimer);
        S.resizeTimer = window.setTimeout(fitLayout, 100);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
    window.addEventListener('pagehide', saveGame);
}

let runtimeStarted = false;

export function initOnload() {
    const start = () => {
        if (runtimeStarted) return;
        runtimeStarted = true;
        fitLayout();
        const configuredUrl = getMultiplayerUrl();
        // An invite link looks like /maze.html?room=K7QF and opens its seat once the server answers.
        let inviteCode = '';
        try {
            const params = new URLSearchParams(location.search);
            inviteCode = cleanCode(params.get('room') || '');
            if (params.has('room')) history.replaceState(null, '', location.pathname + location.hash);
        } catch (_) { }
        if (configuredUrl) multiplayerClient.connect(configuredUrl);
        else handleNetworkStatus('offline', 'Server URL needed');
        if (inviteCode.length >= 4) lobbyHub.joinWhenReady(inviteCode);
        const saved = loadSave();
        if (saved) restoreGame(saved); else showMenu();
        requestAnimationFrame(frame);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                S.lastT = performance.now();
                requestAnimationFrame(frame);
            }
        });
    };

    // React can mount after the browser's load event. Start immediately when the
    // document is already ready; otherwise preserve the previous load timing.
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
}
