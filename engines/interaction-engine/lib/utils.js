'use strict';

function sleep(ms) {
    const delay =
        Number.isFinite(ms) && ms > 0
            ? Math.floor(ms)
            : 0;

    return new Promise(resolve => {
        setTimeout(resolve, delay);
    });
}

async function withTimeout(
    promise,
    timeoutMs,
    message = 'Operation timed out.'
) {
    const timeout =
        Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.floor(timeoutMs)
            : 30000;

    let timer = null;

    try {
        return await Promise.race([
            Promise.resolve(promise),

            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(
                        new Error(message)
                    );
                }, timeout);
            })
        ]);
    } finally {
        if (timer !== null) {
            clearTimeout(timer);
        }
    }
}

function normalizeError(error) {
    if (error instanceof Error) {
        return error;
    }

    if (
        error &&
        typeof error === 'object'
    ) {
        let message = '';

        try {
            message =
                typeof error.message === 'string' &&
                    error.message.trim() !== ''
                    ? error.message
                    : JSON.stringify(error);
        } catch {
            message = '';
        }

        return new Error(
            message || 'Unknown error.'
        );
    }

    return new Error(
        error === undefined ||
            error === null
            ? 'Unknown error.'
            : String(error)
    );
}

function clampInteger(
    value,
    fallback,
    min,
    max
) {
    const parsed =
        Number(value);

    if (
        !Number.isSafeInteger(parsed)
    ) {
        return fallback;
    }

    return Math.min(
        Math.max(
            parsed,
            min
        ),
        max
    );
}

async function waitFor(
    predicate,
    {
        timeoutMs = 30000,
        intervalMs = 250,
        message =
        'Condition was not satisfied in time.'
    } = {}
) {
    if (
        typeof predicate !== 'function'
    ) {
        throw new TypeError(
            'predicate must be a function.'
        );
    }

    const timeout =
        Number.isFinite(timeoutMs) &&
            timeoutMs > 0
            ? Math.floor(timeoutMs)
            : 30000;

    const interval =
        Number.isFinite(intervalMs) &&
            intervalMs > 0
            ? Math.floor(intervalMs)
            : 250;

    const startedAt =
        Date.now();

    while (true) {
        let result;

        try {
            result =
                await predicate();
        } catch (error) {
            throw normalizeError(error);
        }

        if (result) {
            return;
        }

        if (
            Date.now() - startedAt >=
            timeout
        ) {
            throw new Error(message);
        }

        await sleep(interval);
    }
}

function deferred() {
    let resolve;
    let reject;

    const promise =
        new Promise(
            (res, rej) => {
                resolve = res;
                reject = rej;
            }
        );

    return {
        promise,
        resolve,
        reject
    };
}

module.exports = {
    sleep,
    withTimeout,
    normalizeError,
    clampInteger,
    waitFor,
    deferred
};