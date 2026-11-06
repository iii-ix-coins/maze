const https = require('https');const http = require('http');class RpcClient {constructor(endpoint, options = {}) {this.endpoint = endpoint;this.timeout = options.timeout || 15000; // 15 seconds timeoutthis.maxRetries = options.maxRetries || 5;this.baseDelay = options.baseDelay || 500; // Initial retry delay in msthis.maxConcurrent = options.maxConcurrent || 15; // Limit concurrent HTTP requests for free tierthis.activeRequests = 0;this.queue = [];    // Configure Keep-Alive agents to reuse connections and reduce latency
    const parsedUrl = new URL(endpoint);
    const agentOptions = { keepAlive: true, maxSockets: 30, timeout: this.timeout };
    this.agent = parsedUrl.protocol === 'https:' ? new https.Agent(agentOptions) : new http.Agent(agentOptions);
}

async request(method, params = []) {
    return new Promise((resolve, reject) => {
        const execute = async () => {
            this.activeRequests++;
            let attempt = 0;

            while (attempt < this.maxRetries) {
                try {
                    const result = await this._sendHttpRequest(method, params);
                    this._release();
                    return resolve(result);
                } catch (error) {
                    attempt++;
                    const isRateLimit = error.message && (error.message.includes('429') || error.message.includes('Too Many Requests'));
                    const isTimeout = error.code === 'ETIMEDOUT' || error.message.includes('timeout') || error.message.includes('terminated');

                    if (attempt >= this.maxRetries) {
                        this._release();
                        return reject(new Error(`RPC Request failed after ${this.maxRetries} attempts (${method}): ${error.message}`));
                    }

                    // Calculate exponential backoff with jitter
                    const delay = Math.min(this.baseDelay * Math.pow(2, attempt) + Math.random() * 200, 10000);
                    await new Promise(res => setTimeout(res, delay));
                }
            }
            this._release();
            reject(new Error(`Max retries reached for method ${method}`));
        };

        if (this.activeRequests >= this.maxConcurrent) {
            this.queue.push(execute);
        } else {
            execute();
        }
    });
}

_sendHttpRequest(method, params) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        });

        const parsedUrl = new URL(this.endpoint);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            agent: this.agent,
            timeout: this.timeout
        };

        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const req = lib.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 429) {
                    return reject(new Error('HTTP 429 Too Many Requests'));
                }
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP Error: ${res.statusCode}`));
                }
                try {
                    const json = JSON.parse(body);
                    if (json.error) {
                        return reject(new Error(`RPC Error: ${JSON.stringify(json.error)}`));
                    }
                    resolve(json.result);
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${body.substring(0, 100)}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('ETIMEDOUT'));
        });

        req.write(data);
        req.end();
    });
}

_release() {
    this.activeRequests--;
    if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
        const next = this.queue.shift();
        next();
    }
}
}module.exports = RpcClient;