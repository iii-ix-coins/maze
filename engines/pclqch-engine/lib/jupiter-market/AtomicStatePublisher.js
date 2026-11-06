'use strict';

const fs = require('fs');
const path = require('path');

class AtomicStatePublisher {
    constructor(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            throw new TypeError('filePath must be a non-empty string.');
        }

        this.filePath = filePath;
        this.tempPath = `${filePath}.tmp`;

        fs.mkdirSync(
            path.dirname(filePath),
            { recursive: true }
        );
    }

    publish(data) {
        if (!data || typeof data !== 'object') {
            throw new TypeError('State data must be an object.');
        }

        const payload = JSON.stringify({
            schemaVersion: 1,
            ...data,
            updatedAtMs: Date.now(),
            updatedAt: new Date().toISOString()
        });

        fs.writeFileSync(
            this.tempPath,
            payload,
            'utf8'
        );

        fs.renameSync(
            this.tempPath,
            this.filePath
        );
    }

    clear() {
        for (const file of [
            this.filePath,
            this.tempPath
        ]) {
            try {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            } catch {
                // Ignore cleanup errors.
            }
        }
    }
}

module.exports = AtomicStatePublisher;
