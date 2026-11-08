// Moved verbatim from legacy/mazeV3/server/server.js (statements 68, 69, 70, 71, 72, 73, 145, 146, 147, 148, 149, 156). Only imports/exports and `S.` state access were added.
import { ALLOWED_ORIGINS, PLATFORM, LOOPBACK_HOSTS, TRUST_PROXY, BACKPRESSURE_BYTES, PROTOCOL_VERSION, FRONTEND_ROOT, MIME_TYPES, MAX_CONNECTIONS, MAX_CONNECTIONS_PER_IP, PORT, HOST } from './config';
import http from 'node:http';
import { activeHttpResponses, S, clients, rooms, connectionsByIp } from './state';
import { currentCounts, listableRooms, roomSummary, recentList } from './registry';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
/* ── HTTP ──────────────────────────────────────────────────────────────── */
export function applySecurityHeaders(headers = {}) {
    return {
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-frame-options': 'SAMEORIGIN',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
        ...headers
    };
}

export function originAllowed(req, origin) {
    if (ALLOWED_ORIGINS.size) return Boolean(origin) && ALLOWED_ORIGINS.has(String(origin).toLowerCase());
    if (!origin) return true;
    let url;
    try { url = new URL(origin); } catch (_) { return false; }
    if (PLATFORM === 'local' && LOOPBACK_HOSTS.has(url.hostname)) return true;
    const hosts = [String(req.headers.host || '')];
    if (TRUST_PROXY) hosts.push(String(req.headers['x-forwarded-host'] || '').split(',')[0]);
    return hosts.some(host => host.trim().toLowerCase() === url.host);
}

export function requestIp(req) {
    if (TRUST_PROXY) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim().slice(0, 64);
    }
    return String(req.socket.remoteAddress || 'unknown').slice(0, 64);
}
export function jsonResponse(res, body) {
    res.writeHead(200, applySecurityHeaders({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*'
    }));
    res.end(JSON.stringify(body));
}
export const httpServer = http.createServer((req, res) => {
    activeHttpResponses.add(res);
    res.once('close', () => activeHttpResponses.delete(res));
    res.once('finish', () => activeHttpResponses.delete(res));
    if (S.shuttingDown) { res.writeHead(503, applySecurityHeaders({ 'connection': 'close', 'retry-after': '5' })); res.end('Server shutting down'); return; }
    let pathname;
    try {
        pathname = new URL(req.url!, 'http://localhost').pathname;
    } catch (_) {
        res.writeHead(400, applySecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
        res.end('Bad request');
        return;
    }

    if (pathname === '/health') {
        const counts = currentCounts();
        let bufferedMaxBytes = 0, backloggedPeers = 0;
        for (const peer of clients.values()) {
            const buffered = peer.socket.bufferedAmount || 0;
            if (buffered > bufferedMaxBytes) bufferedMaxBytes = buffered;
            if (buffered > BACKPRESSURE_BYTES) backloggedPeers++;
        }
        jsonResponse(res, {
            status: 'ok',
            service: 'maze-multiplayer',
            protocol: PROTOCOL_VERSION,
            onlinePlayers: counts.onlinePlayers,
            waitingPlayers: counts.waitingPlayers,
            waitingRooms: counts.waitingRooms,
            liveRooms: counts.liveRooms,
            spectators: counts.spectators,
            activeRooms: rooms.size,
            // Outgoing backlog across all sockets: stays small unless a client has stopped reading.
            bufferedMaxBytes,
            backloggedPeers,
            frontendServed: Boolean(FRONTEND_ROOT)
        });
        return;
    }
    if (pathname === '/rooms') {
        // Read-only mirror of the lobby, handy for debugging and monitoring.
        jsonResponse(res, { rooms: listableRooms().map(roomSummary), recent: recentList(), counts: currentCounts() });
        return;
    }

    if (FRONTEND_ROOT && req.method === 'GET') {
        let decodedPath;
        try { decodedPath = decodeURIComponent(pathname); }
        catch (_) {
            res.writeHead(400, applySecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
            res.end('Bad path');
            return;
        }
        const relativePath = decodedPath === '/' || decodedPath === '/maze.html' ? 'index.html' : decodedPath.replace(/^\/+/, '');
        const filePath = path.resolve(FRONTEND_ROOT, relativePath);
        const allowedPath = filePath === FRONTEND_ROOT || filePath.startsWith(FRONTEND_ROOT + path.sep);
        if (allowedPath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.writeHead(200, applySecurityHeaders({
                'content-type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'cache-control': /\.(html|js|mjs|css)$/.test(filePath) ? 'no-cache' : 'public, max-age=86400',
            }));
            const stream = fs.createReadStream(filePath);
            stream.on('error', error => {
                console.error('[http] static file stream failed:', error.message);
                if (!res.headersSent) res.writeHead(500, applySecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
                if (!res.destroyed) res.end('Internal server error');
            });
            stream.pipe(res);
            return;
        }
    }

    res.writeHead(404, applySecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
    res.end('Not found');
});

export const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
    verifyClient: (info, done) => {
        if (S.shuttingDown) return done(false, 503, 'Server shutting down');
        if (!originAllowed(info.req, info.origin)) return done(false, 403, 'Origin not allowed');
        const ip = requestIp(info.req);
        const count = connectionsByIp.get(ip) || 0;
        if (clients.size >= MAX_CONNECTIONS || count >= MAX_CONNECTIONS_PER_IP) return done(false, 429, 'Connection limit reached');
        info.req.mazeClientIp = ip;
        done(true);
    }
});

export function initHttpServer() {

httpServer.on('clientError', (error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});
httpServer.headersTimeout = 15_000;
httpServer.requestTimeout = 30_000;
httpServer.keepAliveTimeout = 5_000;

httpServer.on('error', (error: any) => {
    if (error && error.code === 'EADDRINUSE') {
        console.error(`[startup] Port ${PORT} is already in use. Stop the other service on this port, or launch with a different PORT and enter the matching WebSocket URL in the game settings.`);
    } else {
        console.error('[startup] HTTP/WebSocket server failed:', error && error.stack || error);
    }
    if (!httpServer.listening) process.exit(1);
});
}

export function startListening() {

httpServer.listen(PORT, HOST, () => {
    const port = (httpServer.address() as any).port;
    console.log(`Maze multiplayer server listening on port ${port}`);
    if (FRONTEND_ROOT) {
        console.log(`Local game: http://127.0.0.1:${port}/`);
        console.log(`Health check: http://127.0.0.1:${port}/health`);
        console.log(`WebSocket: ws://127.0.0.1:${port}`);
    } else {
        console.log(`Health check: http://127.0.0.1:${port}/health`);
        console.log('Frontend files are not beside server.js; deploy the web client separately.');
    }
    console.log(`[env] platform=${PLATFORM}; publicDomain=${process.env.RAILWAY_PUBLIC_DOMAIN || '-'}`);
    console.log(`[security] maxConnections=${MAX_CONNECTIONS}; maxPerIp=${MAX_CONNECTIONS_PER_IP}; originCheck=${ALLOWED_ORIGINS.size ? 'allowlist' : 'same-host'}; trustProxy=${TRUST_PROXY}`);
});
}
