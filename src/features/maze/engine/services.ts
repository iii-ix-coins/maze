// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 60, 61, 71, 72). Only imports/exports and `S.` state access were added.
import { CreateGameComponent } from '../ui/create-game/create-game';
import { $ } from './dom';
import { launchGame, pickRacer, handleMultiplayerMessage, handleNetworkStatus, getMultiplayerUrl } from './online';
import { RaceBoardComponent } from '../ui/race-board';
import { MazeMultiplayerClient } from '../net/multiplayer-client';
import { LobbyHub } from '../ui/lobby/lobby-hub';
export const createGame = new CreateGameComponent($('createGame'), { onLaunch: launchGame });
export const raceBoard = new RaceBoardComponent($('raceBoard'), $('raceList'), { onPick: pickRacer });
   // racer id → smoothed {r, c} so everybody glides between cells
export const multiplayerClient = new MazeMultiplayerClient({
    onMessage: handleMultiplayerMessage,
    onStatus: handleNetworkStatus
});
export const lobbyHub = new LobbyHub({
    client: multiplayerClient,
    shell: createGame,
    getServerUrl: getMultiplayerUrl,
    retryConnection: () => multiplayerClient.connect(getMultiplayerUrl())
});
