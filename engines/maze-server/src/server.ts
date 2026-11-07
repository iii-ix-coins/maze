/**
 * Room-based WebSocket server for Maze (protocol v2).
 *
 * A *room* is one explicit game. It is created with a set-up (board size, seats, targets), lists itself in the
 * lobby while it waits for racers, then runs the race and stays visible as a live game that anybody can watch.
 *
 *   waiting ──(full, or the host starts early)──▶ preparing ──(host publishes the maze)──▶ playing ──▶ finished
 *
 * Client → server
 *   lobby:watch / lobby:unwatch     subscribe to the lobby (full `lobby:state`, then small `lobby:patch`es)
 *   lobby:peek {ids}                live thumbnails for up to MAX_PEEKS running games (`peek:maze`, `peek:frame`)
 *   room:create {size,players,goals,name}      open a new room and sit in it as host
 *   room:join {roomId | code, name}            take a seat in a waiting room
 *   room:quick {size,players,goals,name,separate}  join a matching waiting room, or open one
 *   room:start                                  host only: start now with 2+ racers
 *   room:leave                                  leave (or stop watching)
 *   spectate:join {roomId | code} / spectate:leave
 *   maze:publish {maze}   host builds the shared maze      player:move {direction}
 *   queue:join / queue:leave                    protocol v1 aliases (quick match / leave)
 * Server → client
 *   connected {protocol}, lobby:state, lobby:patch, room:joined, room:state, room:host, room:closed, room:left,
 *   room:error {code,message}, game:start, room:update, game:finish, player:blocked,
 *   spectate:start, spectate:left, spectate:ended, peek:maze, peek:frame, peek:end, protocol:error
 *
 * Many rooms, of the same or different set-ups, run side by side; each owns its race state.
 */
import { initConnections } from './connection';
import { initTimers } from './timers';
import { initHttpServer, startListening } from './http';
import { initShutdown } from './shutdown';

// Same order as the legacy single-file server: connections, timers, HTTP server events, shutdown handlers, listen.
initConnections();
initTimers();
initHttpServer();
initShutdown();
startListening();
