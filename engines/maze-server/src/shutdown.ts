// Moved verbatim from legacy/mazeV3/server/server.js (statements 150, 151, 152, 153, 154, 155). Only imports/exports and `S.` state access were added.
import { S, clients, rooms, activeHttpResponses, intervalHandles } from './state';
import { httpServer, wss, applySecurityHeaders } from './http';
import { SHUTDOWN_TIMEOUT_MS } from './config';
import { clearRoomTimers } from './rooms';
import WebSocket from 'ws';

export function shutdown(signal = 'shutdown') {
    if (S.shutdownPromise) return S.shutdownPromise;
    S.shuttingDown = true;
    console.log(`[shutdown] ${signal}: stopping acceptance of new work; peers=${clients.size}, rooms=${rooms.size}`);
    S.shutdownPromise = new Promise<void>(resolve => {
        let httpClosed = !httpServer.listening;
        let wsServerClosed = false;
        let settled = false;
        const pendingPeers = new Set(Array.from(wss.clients));

        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(forceTimer);
            console.log('[shutdown] complete');
            resolve();
        };
        const maybeFinish = () => {
            // A WebSocket close frame is only useful if the process remains alive
            // long enough for the close handshake to reach the peer.
            if (httpClosed && wsServerClosed && pendingPeers.size === 0) finish();
        };
        const forceTimer = setTimeout(() => {
            console.error('[shutdown] deadline reached; forcing remaining connections closed');
            for (const socket of pendingPeers) { try { socket.terminate(); } catch (_) { } }
            for (const peer of clients.values()) { try { peer.socket.terminate(); } catch (_) { } }
            for (const res of activeHttpResponses) { try { res.destroy(); } catch (_) { } }
            finish();
        }, SHUTDOWN_TIMEOUT_MS);
        forceTimer.unref();

        for (const timer of intervalHandles) clearInterval(timer);
        if (S.lobbyTimer) { clearTimeout(S.lobbyTimer); S.lobbyTimer = null; }
        for (const room of rooms.values()) clearRoomTimers(room);

        for (const socket of pendingPeers) {
            socket.once('close', () => {
                pendingPeers.delete(socket);
                maybeFinish();
            });
            try {
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close(1012, 'Service restart');
                } else {
                    pendingPeers.delete(socket);
                }
            } catch (_) {
                pendingPeers.delete(socket);
            }
        }

        for (const res of activeHttpResponses) {
            if (!res.headersSent) res.writeHead(503, applySecurityHeaders({ 'connection': 'close', 'retry-after': '5' }));
            try { res.end('Server shutting down'); } catch (_) { }
        }

        try {
            // Stop accepting new TCP connections and wait for both HTTP and
            // WebSocket shutdown. http.Server.close alone does not guarantee
            // upgraded WebSocket peers completed their close handshake.
            // With an attached HTTP server, ws.Server.close() owns closing the
            // underlying listener. Do not call httpServer.close() separately:
            // doing both can race and obscure the actual close completion.
            wss.close(() => {
                httpClosed = true;
                wsServerClosed = true;
                maybeFinish();
            });
            maybeFinish();
        } catch (error) {
            console.error('[shutdown] close failed:', error);
            finish();
        }
    });
    return S.shutdownPromise;
}

export function initShutdown() {
// Windows does not deliver POSIX signals to child processes consistently. This
// opt-in IPC hook exists only for the automated shutdown test; it is disabled in
// normal deployments and does not add a network-accessible control surface.
if (process.env.MAZE_TEST_SHUTDOWN === '1' && process.send) {
    process.once('message', (message: any) => {
        if (message && message.type === 'maze:test-shutdown') {
            shutdown('test IPC').finally(() => process.exit(0));
        }
    });
}
process.once('SIGTERM', () => { shutdown('SIGTERM').finally(() => process.exit(0)); });
process.once('SIGINT', () => { shutdown('SIGINT').finally(() => process.exit(0)); });
process.once('uncaughtException', error => {
    console.error('[fatal] uncaught exception:', error && error.stack || error);
    shutdown('uncaughtException').finally(() => process.exit(1));
});
process.once('unhandledRejection', (reason: any) => {
    console.error('[fatal] unhandled rejection:', reason && reason.stack || reason);
    shutdown('unhandledRejection').finally(() => process.exit(1));
});
}
