'use strict';

const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = __dirname;

const dotenvResult = require('dotenv').config({
    path: path.join(
        ROOT_DIR,
        '.env'
    )
});

if (dotenvResult?.parsed && Object.prototype.hasOwnProperty.call(dotenvResult.parsed, 'TX_WS_ENABLED')) {
    const fileValue = String(dotenvResult.parsed.TX_WS_ENABLED).trim().toLowerCase();
    const effectiveValue = String(process.env.TX_WS_ENABLED ?? '').trim().toLowerCase();
    if (fileValue !== effectiveValue) {
        console.warn(
            `[Launcher] TX_WS_ENABLED conflict: .env=${fileValue}, process=${effectiveValue}. Existing process environment wins.`
        );
    }
}

console.log(
    `[Launcher] Effective TX_WS_ENABLED=${String(process.env.TX_WS_ENABLED ?? 'undefined')}`
);

function envBoolean(value, fallback = false) {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();

    if (!normalized) {
        return fallback;
    }

    return [
        '1',
        'true',
        'yes',
        'on'
    ].includes(normalized);
}

function envPositiveInteger(
    value,
    fallback
) {
    const number = Number(value);

    if (
        Number.isSafeInteger(number) &&
        number > 0
    ) {
        return number;
    }

    return fallback;
}

const SHUTDOWN_TIMEOUT_MS =
    envPositiveInteger(
        process.env.SHUTDOWN_TIMEOUT_MS,
        15_000
    );

const SERVICE_RESTART_DELAY_MS =
    envPositiveInteger(
        process.env.SERVICE_RESTART_DELAY_MS,
        3_000
    );

const SERVICES = [
    {
        name: 'Web Server',
        script: path.join(
            ROOT_DIR,
            'server.js'
        ),
        restart: true
    },
    {
        name: 'PCLQCH Engine',
        script: path.join(
            ROOT_DIR,
            'engines',
            'pclqch-engine',
            'index.js'
        ),
        restart: true
    },
    {
        name: 'Jupiter Market Engine',
        script: path.join(
            ROOT_DIR,
            'engines',
            'pclqch-engine',
            'jupiter-market-runner.js'
        ),
        restart: true,
        enabled: () =>
            envBoolean(
                process.env.JUPITER_MARKET_DATA_ENABLED,
                false
            )
    },
    {
        name: 'Transaction Engine',
        script: path.join(
            ROOT_DIR,
            'engines',
            'tx-engine',
            'index.js'
        ),
        restart: true
    },
    {
        name: 'Holder Engine',
        script: path.join(
            ROOT_DIR,
            'engines',
            'holder-engine',
            'index.js'
        ),
        restart: true
    },
    {
        name: 'Verify Engine',
        script: path.join(
            ROOT_DIR,
            'engines',
            'verify-engine',
            'index.js'
        ),
        restart: true
    },
    {
        name: 'Interaction Engine',
        script: path.join(
            ROOT_DIR,
            'engines',
            'interaction-engine',
            'index.js'
        ),
        restart: true
    }
];

const children = new Map();
const restartTimers = new Set();
let shuttingDown = false;
let shutdownTimer = null;
let shutdownForced = false;

function prefixOutput(name, stream, data) {
    const text = String(data);

    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) {
            continue;
        }

        stream.write(
            `[${name}] ${line}\n`
        );
    }
}

function scheduleRestart(service) {
    if (shuttingDown) {
        return;
    }

    const timer = setTimeout(() => {
        restartTimers.delete(timer);
        spawnService(service);
    }, SERVICE_RESTART_DELAY_MS);

    restartTimers.add(timer);
}

function spawnService(service) {
    if (shuttingDown) {
        return;
    }

    if (
        typeof service.enabled === 'function' &&
        !service.enabled()
    ) {
        console.log(
            `[Launcher] ${service.name} disabled. Skipping.`
        );
        return;
    }

    console.log(
        `[Launcher] Starting ${service.name}...`
    );

    const child = spawn(
        process.execPath,
        [service.script],
        {
            cwd: ROOT_DIR,
            env: {
                ...process.env,
                NODE_ENV:
                    process.env.NODE_ENV ||
                    'production'
            },
            stdio: [
                'inherit',
                'pipe',
                'pipe'
            ],
            windowsHide: false
        }
    );

    children.set(
        service.name,
        child
    );

    child.stdout.on(
        'data',
        data => {
            prefixOutput(
                service.name,
                process.stdout,
                data
            );
        }
    );

    child.stderr.on(
        'data',
        data => {
            prefixOutput(
                service.name,
                process.stderr,
                data
            );
        }
    );

    child.on(
        'error',
        error => {
            console.error(
                `[Launcher] ${service.name} process error:`,
                error?.message || error
            );
        }
    );

    child.on(
        'exit',
        (code, signal) => {
            const current = children.get(
                service.name
            );

            if (current === child) {
                children.delete(
                    service.name
                );
            }

            if (shuttingDown) {
                checkShutdownComplete();
                return;
            }

            console.warn(
                `[Launcher] ${service.name} exited. ` +
                `code=${code} signal=${signal || 'none'}`
            );

            if (service.restart) {
                console.log(
                    `[Launcher] Restarting ${service.name} ` +
                    `in ${SERVICE_RESTART_DELAY_MS}ms...`
                );

                scheduleRestart(service);
            }
        }
    );
}

function requestChildStop(name, child) {
    if (!child || child.killed) {
        return;
    }

    console.log(
        `[Launcher] Stopping ${name}...`
    );

    try {
        // On Windows, Ctrl+C is delivered to the console process group.
        // Avoid immediately hard-killing children so their own SIGINT
        // handlers get a chance to flush/close resources.
        if (
            process.platform === 'win32' &&
            shutdownSignal === 'SIGINT'
        ) {
            return;
        }

        child.kill(
            process.platform === 'win32'
                ? undefined
                : 'SIGTERM'
        );
    } catch (error) {
        console.warn(
            `[Launcher] Failed to stop ${name}:`,
            error?.message || error
        );
    }
}

let shutdownSignal = null;

function forceStopRemainingChildren() {
    for (const [name, child] of children.entries()) {
        try {
            console.warn(
                `[Launcher] Force stopping ${name} after shutdown timeout.`
            );
            child.kill();
        } catch (error) {
            console.warn(
                `[Launcher] Failed to force stop ${name}:`,
                error?.message || error
            );
        }
    }
}

function finishShutdown(exitCode = 0) {
    if (shutdownTimer) {
        clearTimeout(shutdownTimer);
        shutdownTimer = null;
    }

    for (const timer of restartTimers) {
        clearTimeout(timer);
    }

    restartTimers.clear();

    console.log(
        `[Launcher] All services stopped. Exiting with code ${exitCode}.`
    );

    process.exit(exitCode);
}

function checkShutdownComplete() {
    if (!shuttingDown) {
        return;
    }

    if (children.size === 0) {
        finishShutdown(
            shutdownForced ? 1 : 0
        );
    }
}

function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    shutdownSignal = signal;

    console.log(
        `\n[Launcher] Received ${signal}. ` +
        'Shutting down all services...'
    );

    for (const [name, child] of children.entries()) {
        requestChildStop(
            name,
            child
        );
    }

    checkShutdownComplete();

    if (children.size === 0) {
        return;
    }

    shutdownTimer = setTimeout(() => {
        shutdownForced = true;
        forceStopRemainingChildren();

        // Give exit events a brief chance to clear the map after force stop.
        setTimeout(() => {
            finishShutdown(1);
        }, 500);
    }, SHUTDOWN_TIMEOUT_MS);
}

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);

process.on(
    'uncaughtException',
    error => {
        console.error(
            '[Launcher] Uncaught exception:',
            error
        );
        shutdown('uncaughtException');
    }
);

process.on(
    'unhandledRejection',
    reason => {
        console.error(
            '[Launcher] Unhandled rejection:',
            reason
        );
    }
);

console.log(
    '[Launcher] Hollld platform starting...'
);

for (const service of SERVICES) {
    spawnService(service);
}

