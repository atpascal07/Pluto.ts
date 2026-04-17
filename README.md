

`pluto.ts` is a scaling library for Discord bots. It helps you run shards and clusters across one or many machines with a central Bridge.

## Features

- Multi-shard and multi-cluster orchestration
- Distributed scaling across multiple machines/containers
- Bridge-based coordination between instances
- Reclustering support
- Graceful shutdown support
- Integrated local Bridge dashboard

## Installation

```bash
npm install pluto.ts
# or
yarn add pluto.ts
```

## Quick Start

### 1) Standalone instance (single machine)

```ts
import { StandaloneInstance } from "pluto.ts";

const instance = new StandaloneInstance(
  `${__dirname}/bot.js`,
  2,
  2,
  process.env.BOT_TOKEN!,
  [],
);

instance.start();
```

### 2) Bot/Cluster file

```ts
import { Cluster } from "pluto.ts";
import { Client, ClientOptions } from "discord.js";

export class ExtendedClient extends Client {
  cluster: Cluster<ExtendedClient>;

  constructor(options: ClientOptions, cluster: Cluster<ExtendedClient>) {
    super(options);
    this.cluster = cluster;
  }
}

const cluster = Cluster.initial<ExtendedClient>();

const client = new ExtendedClient(
  {
    shards: cluster.shardList,
    shardCount: cluster.totalShards,
    intents: cluster.intents,
  },
  cluster,
);

cluster.client = client;
client.login(cluster.token);
```

## Graceful Shutdown

`StandaloneInstance` provides `shutdown()` and waits for cluster cleanup before exiting.

```ts
process.on("SIGTERM", () => instance.shutdown().then(() => process.exit(0)));
process.on("SIGINT", () => instance.shutdown().then(() => process.exit(0)));
```

For custom cleanup in cluster processes:

```ts
cluster.onSelfDestruct = async () => {
  await client.destroy();
};
```

## Distributed Setup (Bridge)

Typical setup:

1. Start one **Bridge**
2. Start multiple **instances** connected to that Bridge
3. Let pluto.ts distribute and rebalance clusters automatically

### Terminology

- **Instance**: Runtime node managing clusters
- **Cluster**: Process group managing shards
- **Shard**: Discord gateway partition
- **Bridge**: Central coordinator for instances

## Bridge Dashboard

When `Bridge.start()` runs, a local dashboard starts automatically.

```text
[Dashboard] Web dashboard available at http://127.0.0.1:9100
```

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Simple HTML dashboard |
| `GET` | `/api/status` | Bridge status as JSON |

Example status response:

```json
{
  "running": true,
  "uptime": 42,
  "version": "x.x.x",
  "instances": [],
  "clusters": []
}
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Bridge IPC server port (instances connect on this port) |
| `DASHBOARD_PORT` | `9100` | Dashboard HTTP port |

Set `PORT` in your `.env` file to change the port the Bridge listens on:

```env
PORT=4000
DASHBOARD_PORT=9100
```

Both variables are read automatically at startup — no code change needed.

### Optional constructor override

```ts
import { Bridge } from "pluto.ts";

const bridge = new Bridge(
  3000,
  process.env.BOT_TOKEN!,
  ["Guilds"],
  2,
  2,
  60_000,
  false,
  { port: 8080 },
);

bridge.start();
```

### Security notice

The dashboard binds to `127.0.0.1` by default and is local-only.
Do not expose it publicly without authentication.

## Discord.js Compatibility

`pluto.ts` is designed to work smoothly with modern `discord.js` setups.

## Use Cases

- High-traffic bots with many guilds
- Horizontal scaling with Docker/Kubernetes
- Better resource usage across machines

## License

MIT © 2025 GalaxyBot
