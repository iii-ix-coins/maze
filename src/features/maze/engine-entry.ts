/**
 * Explicit Maze Engine lifecycle boundary.
 *
 * Importing this module is side-effect free with respect to the running game:
 * mountMazeEngine() installs input/window listeners, starts simulation and
 * opens the WebSocket; the returned disposer tears every owned resource down.
 */
import { createGame, lobbyHub, multiplayerClient } from './engine/services';
import { initLegacyUrlCleanup, launchGame } from './engine/online';
import { clearEngineTimeouts } from './engine/runtime-timers';
import { initKeyboard } from './input/keyboard';
import { initToolbar } from './input/toolbar';
import { initPointer } from './input/pointer';
import { initJoystick } from './input/joystick';
import { initMiniMap } from './input/minimap';
import {
  initButtons,
  initWindowEvents,
  startMazeRuntime,
  syncMazeRouteLocation as syncMazeRouteLocationImpl,
  prepareRuntimeDisposal,
} from './engine/boot';

type EngineMount = { controller: AbortController; dispose: () => void };
let activeMount: EngineMount | null = null;

export function mountMazeEngine(): () => void {
  if (activeMount) return activeMount.dispose;

  const controller = new AbortController();
  const { signal } = controller;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (activeMount?.controller === controller) activeMount = null;

    // Persist/leave while the current services are still available. Then abort
    // all Runtime-owned listeners/RAF work and finally close the socket (which
    // also clears any reconnect timer).
    try {
      prepareRuntimeDisposal();
    } catch (error) {
      console.error('[Maze] Engine state cleanup failed:', error);
    } finally {
      clearEngineTimeouts();
      controller.abort();
    }
    multiplayerClient.disconnect(false);
    createGame.setOnLaunch(() => undefined);
    delete document.documentElement.dataset.mazeEngineReady;
    delete document.documentElement.dataset.mazeActiveRun;
    window.dispatchEvent(new Event('maze:engine-disposed'));
  };

  activeMount = { controller, dispose };

  try {
    createGame.setOnLaunch(launchGame);
    lobbyHub.mount(signal);
    initLegacyUrlCleanup();
    initKeyboard(signal);
    initToolbar(signal);
    initPointer(signal);
    initJoystick(signal);
    initMiniMap(signal);
    initButtons(signal);
    initWindowEvents(signal);
    startMazeRuntime(signal);
  } catch (error) {
    dispose();
    throw error;
  }

  return dispose;
}

export function syncMazeRouteLocation() {
  if (!activeMount || activeMount.controller.signal.aborted) return;
  syncMazeRouteLocationImpl();
}


