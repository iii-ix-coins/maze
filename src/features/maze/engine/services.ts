// Runtime singletons shared by the engine, multiplayer coordinator and React UI.
import { createGame } from '../ui/create-game/create-game';
import { launchGame, pickRacer, handleMultiplayerMessage, handleNetworkStatus, getMultiplayerUrl } from './online';
import { RaceBoardComponent } from '../ui/race-board';
import { MazeMultiplayerClient } from '../net/multiplayer-client';
import { LobbyHub } from '../ui/lobby/lobby-hub';

createGame.setOnLaunch(launchGame);
export { createGame };
export const raceBoard = new RaceBoardComponent({ onPick: pickRacer });
export const multiplayerClient = new MazeMultiplayerClient({
  onMessage: handleMultiplayerMessage,
  onStatus: handleNetworkStatus,
});
export const lobbyHub = new LobbyHub({
  client: multiplayerClient,
  shell: createGame,
  getServerUrl: getMultiplayerUrl,
  retryConnection: () => multiplayerClient.connect(getMultiplayerUrl()),
});
