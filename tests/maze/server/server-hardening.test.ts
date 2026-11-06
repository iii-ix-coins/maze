import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/maze-server/server.cjs');

function boot(env = {}, { ipc = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [SERVER], {
            env: { ...process.env, MAZE_PORT: '0', MAZE_HEARTBEAT_MS: '60000', MAZE_SHUTDOWN_TIMEOUT_MS: '1500', ...env },
            stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        let settled = false;
        const timeout = setTimeout(() => {
            if (!settled) { settled = true; child.kill('SIGKILL'); reject(new Error(`server startup timeout:\n${output}`)); }
        }, 5000);
        const onData = chunk => {
            output += chunk;
            const match = /listening on port (\d+)/.exec(output);
            if (match && !settled) {
                settled = true;
                clearTimeout(timeout);
                resolve({ child, port: Number(match[1]), get output() { return output; } });
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.once('exit', code => {
            if (!settled) { settled = true; clearTimeout(timeout); reject(new Error(`server exited (${code}):\n${output}`)); }
        });
    });
}

function connect(port, origin) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
    });
}

async function stop(server, signal = 'SIGTERM') {
    if (server.child.exitCode !== null) return;
    server.child.kill(signal);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`server did not stop:\n${server.output}`)), 4000);
        server.child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
}

test('HTTP responses include baseline security headers without changing health payload', async () => {
    const server = await boot();
    try {
        const response = await fetch(`http://127.0.0.1:${server.port}/health`);
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.status, 'ok');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    } finally { await stop(server); }
});

test('configured WebSocket Origin allowlist rejects foreign origins and accepts configured ones', async () => {
    const server = await boot({ MAZE_ALLOWED_ORIGINS: 'https://maze.example' });
    try {
        await assert.rejects(connect(server.port, 'https://attacker.example'));
        const accepted = await connect(server.port, 'https://maze.example');
        accepted.close();
    } finally { await stop(server); }
});

test('per-IP connection cap rejects excess sockets and releases capacity after disconnect', async () => {
    const server = await boot({ MAZE_MAX_CONNECTIONS_PER_IP: '1' });
    try {
        const first = await connect(server.port);
        await assert.rejects(connect(server.port));
        const firstClosed = new Promise(resolve => first.once('close', resolve));
        first.close();
        await firstClosed;
        const next = await connect(server.port);
        next.close();
    } finally { await stop(server); }
});

test('graceful shutdown is bounded and closes WebSocket peers with restart code', async () => {
    // child.kill('SIGTERM') force-terminates child processes on Windows instead
    // of delivering a catchable signal. Use a private, test-only IPC trigger so
    // this test exercises the real shutdown() path on every supported OS.
    const server = await boot({ MAZE_TEST_SHUTDOWN: '1' }, { ipc: true });
    const ws = await connect(server.port);
    const close = new Promise(resolve => ws.once('close', (code, reason) => resolve({ code, reason: String(reason) })));
    const exited = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`server did not stop:\n${server.output}`)), 4000);
        server.child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    server.child.send({ type: 'maze:test-shutdown' });
    const [result, exitCode] = await Promise.all([close, exited]);
    assert.equal(exitCode, 0);
    assert.equal(result.code, 1012);
    assert.match(result.reason, /restart/i);
});

if (process.platform !== 'win32') {
    test('SIGTERM invokes graceful shutdown on platforms with signal delivery', async () => {
        const server = await boot();
        const ws = await connect(server.port);
        const close = new Promise(resolve => ws.once('close', (code, reason) => resolve({ code, reason: String(reason) })));
        await stop(server);
        const result = await close;
        assert.equal(result.code, 1012);
        assert.match(result.reason, /restart/i);
    });
}

test('port collision exits cleanly with a useful startup error instead of leaving timers alive', async () => {
    const first = await boot();
    try {
        const child = spawn(process.execPath, [SERVER], {
            env: { ...process.env, MAZE_PORT: String(first.port), MAZE_HEARTBEAT_MS: '60000' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { output += chunk; });
        const code = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('port-collision process did not exit')); }, 3000);
            child.once('exit', value => { clearTimeout(timer); resolve(value); });
        });
        assert.equal(code, 1);
        assert.match(output, /already in use/i);
    } finally { await stop(first); }
});
