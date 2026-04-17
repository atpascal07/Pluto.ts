/**
 * Dashboard HTTP-endpoint tests.
 *
 * Starts a BridgeDashboard on a random high port (no real Bridge needed),
 * exercises GET / and GET /api/status, then shuts the server down.
 *
 * Run with:  npx tsx test/dashboard.test.ts
 */
import * as http from 'http';
import { BridgeDashboard } from '../src/bridge/BridgeDashboard';

// ---------- tiny assertion helpers ----------
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.error(`  ✗ ${message}`);
        failed++;
    }
}

function get(url: string): Promise<{ statusCode: number; body: string; contentType: string }> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (chunk: Buffer) => (body += chunk.toString()));
            res.on('end', () =>
                resolve({
                    statusCode: res.statusCode ?? 0,
                    body,
                    contentType: String(res.headers['content-type'] ?? ''),
                }),
            );
        }).on('error', reject);
    });
}

// ---------- test runner ----------
async function run(): Promise<void> {
    const port = 19100;
    const dashboard = new BridgeDashboard({ port, host: '127.0.0.1' });
    dashboard.start();

    // Give the server a moment to bind.
    await new Promise<void>((r) => setTimeout(r, 100));

    const base = `http://127.0.0.1:${port}`;

    // --- GET /api/status ---
    console.log('\nGET /api/status');
    const status = await get(`${base}/api/status`);
    assert(status.statusCode === 200, 'responds with 200');
    assert(status.contentType.includes('application/json'), 'Content-Type is application/json');
    const json = JSON.parse(status.body) as Record<string, unknown>;
    assert(json.running === true, 'running === true');
    assert(typeof json.uptime === 'number', 'uptime is a number');
    assert(typeof json.version === 'string', 'version is a string');
    assert(Array.isArray(json.instances), 'instances is an array');
    assert(Array.isArray(json.clusters), 'clusters is an array');

    // --- GET / ---
    console.log('\nGET /');
    const index = await get(`${base}/`);
    assert(index.statusCode === 200, 'responds with 200');
    assert(index.contentType.includes('text/html'), 'Content-Type is text/html');
    assert(index.body.includes('<html'), 'body contains <html>');
    assert(index.body.includes('galactic Bridge Dashboard'), 'body contains dashboard title');

    // --- GET /unknown ---
    console.log('\nGET /unknown');
    const notFound = await get(`${base}/unknown`);
    assert(notFound.statusCode === 404, 'responds with 404');

    // --- tear down ---
    await dashboard.stop();

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
