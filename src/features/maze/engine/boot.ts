// Engine startup is explicit. Event listeners, timers and the simulation loop
// are owned by the current mount and released by its AbortController.
import { $ } from './dom';
import { newMaze, confirmEnd, cancelEnd, showMenu } from './session';
import { S } from './state';
import { fitLayout } from './layout';
import { saveGame, loadSave, restoreGame } from './solo';
import { getMultiplayerUrl, handleNetworkStatus } from './online';
import { cleanCode } from '../ui/lobby/lobby-model';
import { multiplayerClient, lobbyHub, createGame } from './services';
import { frame } from './frame';

export function initButtons(signal: AbortSignal) {
    $('newMazeWin').addEventListener('click', newMaze, { signal });
    $('newMazePanel').addEventListener('click', newMaze, { signal });
    $('endYes').addEventListener('click', confirmEnd, { signal });
    $('endNo').addEventListener('click', cancelEnd, { signal });
}

export function initWindowEvents(signal: AbortSignal) {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
        // This guard applies only to real document unloads (external navigation
        // or closing the tab). In-app Maze exits are confirmed by the SPA router
        // and dispose this listener before committing the route transition.
        if (!S.isGameOver) { event.preventDefault(); event.returnValue = ''; }
    };
    const onResize = () => {
        window.clearTimeout(S.resizeTimer);
        S.resizeTimer = window.setTimeout(fitLayout, 100);
    };
    const onVisibilityChange = () => {
        if (document.hidden) {
            saveGame();
            return;
        }
        S.lastT = performance.now();
    };

    window.addEventListener('beforeunload', onBeforeUnload, { signal });
    window.addEventListener('resize', onResize, { signal });
    document.addEventListener('visibilitychange', onVisibilityChange, { signal });
    window.addEventListener('pagehide', saveGame, { signal });

    signal.addEventListener('abort', () => {
        window.clearTimeout(S.resizeTimer);
        S.resizeTimer = 0;
    }, { once: true });
}

function applyRouteParameters() {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get('view');
    if (requestedView === 'create' || requestedView === 'rooms' || requestedView === 'live') {
        createGame.setView(requestedView, { instant: true });
    }

    const inviteCode = cleanCode(params.get('room') || '');
    if (inviteCode.length >= 4) lobbyHub.joinWhenReady(inviteCode);
    if (params.has('room')) {
        params.delete('room');
        const query = params.toString();
        history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
}

let activeFrameId = 0;
function startFrameLoop(signal: AbortSignal) {
    const stop = () => {
        if (activeFrameId) window.cancelAnimationFrame(activeFrameId);
        activeFrameId = 0;
    };
    const schedule = () => {
        if (signal.aborted || document.hidden || activeFrameId) return;
        activeFrameId = window.requestAnimationFrame((time) => {
            activeFrameId = 0;
            if (signal.aborted || document.hidden) return;
            frame(time);
            schedule();
        });
    };
    const onVisibilityChange = () => {
        if (document.hidden) {
            stop();
            saveGame();
        } else {
            S.lastT = performance.now();
            schedule();
        }
    };

    document.addEventListener('visibilitychange', onVisibilityChange, { signal });
    signal.addEventListener('abort', stop, { once: true });
    schedule();
}

export function startMazeRuntime(signal: AbortSignal) {
    if (signal.aborted) return;
    fitLayout();
    applyRouteParameters();

    const configuredUrl = getMultiplayerUrl();
    if (configuredUrl) multiplayerClient.connect(configuredUrl);
    else handleNetworkStatus('offline', 'Server URL needed');

    const saved = loadSave();
    if (saved) restoreGame(saved);
    else showMenu();

    // Release the initial document-level menu-frame state only after the
    // engine has chosen whether to restore gameplay or show the menu.
    document.documentElement.dataset.mazeActiveRun = (!S.isGameOver && !S.spectating) ? 'true' : 'false';
    document.documentElement.dataset.mazeEngineReady = 'true';
    window.dispatchEvent(new Event('maze:engine-ready'));
    S.lastT = performance.now();
    startFrameLoop(signal);
}

export function syncMazeRouteLocation() {
    if (document.documentElement.dataset.mazeEngineReady !== 'true') return;
    applyRouteParameters();
}

/** State cleanup for online runs that cannot be resumed after their socket closes. */
export function prepareRuntimeDisposal() {
    saveGame();

    // A spectator session is also tied to the current socket even though it
    // does not set multiplayerSession. Leave it before the transport closes.
    if (S.multiplayerSession || S.spectating) {
        S.isGameOver = true;
        showMenu();
        return;
    }

    // A pending join / waiting-room seat is not yet a running multiplayer
    // game. Release it explicitly so the server does not have to wait for the
    // WebSocket close to remove the player. Browsing rooms (phase === idle)
    // keeps the existing LobbyStore and its useful cached data intact.
    if (lobbyHub.phase !== 'idle') lobbyHub.leaveRoom();
}
