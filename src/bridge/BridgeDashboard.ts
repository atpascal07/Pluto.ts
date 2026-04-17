import * as http from 'http';
import { BridgeClusterConnectionStatus } from './BridgeClusterConnection';
import { BridgeInstanceConnectionStatus } from './BridgeInstanceConnection';

const PACKAGE_VERSION = '2.1.5';
export { PACKAGE_VERSION };

export interface DashboardOptions {
    /** TCP port to listen on. Defaults to `DASHBOARD_PORT` env var or 9100. */
    port?: number;
    /** Host/IP to bind to. Defaults to `127.0.0.1` (localhost only). */
    host?: string;
}

/** Minimal status shape returned by GET /api/status */
export interface BridgeStatus {
    running: boolean;
    uptime: number;
    version: string;
    instances: {
        id: number;
        status: string;
        dev: boolean;
        establishedAt: number;
        clusters: {
            clusterID: number;
            status: string;
            shards: number[];
            missedHeartbeats: number;
            readyAt: number | undefined;
        }[];
    }[];
    clusters: {
        clusterID: number;
        status: string;
        shards: number[];
        missedHeartbeats: number;
        readyAt: number | undefined;
    }[];
}

/**
 * Lightweight HTTP dashboard server for the galactic Bridge.
 *
 * Endpoints:
 *   GET /            — simple HTML status UI
 *   GET /api/status  — JSON status of the Bridge
 *
 * Configuration:
 *   DASHBOARD_PORT env var  — TCP port (default: 9100)
 *   DashboardOptions.host   — bind address (default: 127.0.0.1)
 */
export class BridgeDashboard {
    private readonly startedAt: number = Date.now();
    private readonly host: string;
    private readonly port: number;
    private server?: http.Server;

    // Callbacks injected by Bridge so we can read live state without a circular import
    private _getStatus?: () => BridgeStatus;

    constructor(options: DashboardOptions = {}) {
        this.port = options.port ?? parseInt(process.env.DASHBOARD_PORT ?? '9100', 10);
        this.host = options.host ?? '127.0.0.1';
    }

    /** Called by Bridge to wire up the live-status callback. */
    public setStatusProvider(fn: () => BridgeStatus): void {
        this._getStatus = fn;
    }

    public start(): void {
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        this.server.listen(this.port, this.host, () => {
            console.log(`[Dashboard] Web dashboard available at http://${this.host}:${this.port}`);
        });
    }

    public stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = req.url ?? '/';

        if (req.method === 'GET' && url === '/') {
            this.serveIndex(res);
            return;
        }

        if (req.method === 'GET' && url === '/api/status') {
            this.serveStatus(res);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }

    private buildStatus(): BridgeStatus {
        if (this._getStatus) {
            return this._getStatus();
        }

        return {
            running: true,
            uptime: Math.floor((Date.now() - this.startedAt) / 1000),
            version: PACKAGE_VERSION,
            instances: [],
            clusters: [],
        };
    }

    private serveStatus(res: http.ServerResponse): void {
        const status = this.buildStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    }

    private serveIndex(res: http.ServerResponse): void {
        const status = this.buildStatus();
        const instanceRows = status.instances.map(i => `
            <tr>
              <td>${i.id}</td>
              <td>${i.status}</td>
              <td>${i.dev ? 'yes' : 'no'}</td>
              <td>${i.clusters.length}</td>
              <td>${new Date(i.establishedAt).toISOString()}</td>
            </tr>`).join('') || '<tr><td colspan="5">No instances connected</td></tr>';

        const clusterRows = status.clusters.map(c => `
            <tr>
              <td>${c.clusterID}</td>
              <td>${c.status}</td>
              <td>${c.shards.join(', ')}</td>
              <td>${c.missedHeartbeats}</td>
              <td>${c.readyAt ? new Date(c.readyAt).toISOString() : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="5">No clusters</td></tr>';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>galactic Bridge Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
    h1 { color: #58a6ff; margin-bottom: 0.25rem; }
    .subtitle { color: #8b949e; margin-bottom: 2rem; font-size: 0.9rem; }
    .cards { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem 1.75rem; min-width: 160px; }
    .card h2 { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card .value { font-size: 1.75rem; font-weight: 700; color: #58a6ff; }
    .badge-running { color: #3fb950; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border-radius: 8px; overflow: hidden; margin-bottom: 2rem; }
    th { background: #21262d; color: #8b949e; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.6rem 1rem; text-align: left; }
    td { padding: 0.6rem 1rem; border-top: 1px solid #21262d; font-size: 0.85rem; }
    h3 { margin-bottom: 0.5rem; color: #c9d1d9; }
    .refresh { font-size: 0.75rem; color: #8b949e; }
  </style>
</head>
<body>
  <h1>⚡ galactic Bridge Dashboard</h1>
  <p class="subtitle">Version ${status.version} &nbsp;·&nbsp; <span class="badge-running">● Running</span> &nbsp;·&nbsp; Uptime: ${status.uptime}s</p>

  <div class="cards">
    <div class="card"><h2>Status</h2><div class="value badge-running">Running</div></div>
    <div class="card"><h2>Uptime</h2><div class="value">${status.uptime}s</div></div>
    <div class="card"><h2>Instances</h2><div class="value">${status.instances.length}</div></div>
    <div class="card"><h2>Clusters</h2><div class="value">${status.clusters.length}</div></div>
    <div class="card"><h2>Version</h2><div class="value" style="font-size:1.2rem">${status.version}</div></div>
  </div>

  <h3>Connected Instances</h3>
  <table>
    <thead><tr><th>ID</th><th>Status</th><th>Dev</th><th>Clusters</th><th>Connected At</th></tr></thead>
    <tbody>${instanceRows}</tbody>
  </table>

  <h3>Clusters</h3>
  <table>
    <thead><tr><th>Cluster ID</th><th>Status</th><th>Shards</th><th>Missed Heartbeats</th><th>Ready At</th></tr></thead>
    <tbody>${clusterRows}</tbody>
  </table>

  <p class="refresh">Auto-refreshes every 10 seconds.</p>
  <script>setTimeout(() => location.reload(), 10000);</script>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }
}
