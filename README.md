![Galactic Logo](https://s3.galaxybot.app/media/galactic/readmeBanner.png?v=2)

galactic is a powerful scaling library for Discord bots, built to make distributed shard and cluster management simple, efficient, and highly flexible.

## Overview

galactic allows you to run multiple Discord shards within a single process and scale your bot seamlessly across multiple machines or containers. It’s designed to integrate smoothly with [discord.js](https://discord.js.org/), enabling developers to focus on building features instead of managing complex scaling setups.

## Key Features

- Run multiple **Discord shards** in one process
- Automate **cluster distribution** across multiple machines or Docker containers
- Utilize the **galactic Bridge** to synchronize shards and clusters
- **Seamless integration** with discord.js
- Optimized for both **small** and **large-scale** bot deployments
- Easy configuration and setup
- Open-source and actively maintained
- Reclustering without downtime

## Installation

```bash
npm install galactic.ts
# or
yarn add galactic.ts
```

## Quick Start Example

### Standalone Setup (Single Machine)

```ts filename="index.ts"
import {StandaloneInstance} from "galactic.ts";

// Create a standalone instance running 2 clusters with 2 shards each
const instance = new StandaloneInstance(
    `${__dirname}/bot.js`,
    2, 2, process.env.BOT_TOKEN!, 
    []
);

instance.start();
```

### Bot File Setup

```ts filename="bot.ts"
import {Cluster} from "galactic.ts";
import {Client, ClientOptions} from "discord.js";

// Extend the Discord Client to include a reference to its Cluster
export class ExtendedClient extends Client {
    cluster: Cluster<ExtendedClient>;

    constructor(options: ClientOptions, cluster: Cluster<ExtendedClient>) {
        super(options);
        this.cluster = cluster;
    }
}

// Initialize the Cluster
const cluster = Cluster.initial<ExtendedClient>();

const client = new ExtendedClient({
    shards: cluster.shardList,
    shardCount: cluster.totalShards,
    intents: cluster.intents,
}, cluster);

cluster.client = client;

client.login(cluster.token)
```

## Distributed Setup

To scale your bot across multiple servers or containers, galactic uses the **galactic Bridge**.  
Each instance connects to the same bridge to coordinate shard and cluster responsibilities.

Typical distributed setup:
1. Deploy a **Bridge** (centralized coordinator for all instances)
2. Deploy multiple galactic **instances** (e.g., on different VPS or Docker nodes)
3. Configure each instance to connect to the shared Bridge
4. galactic automatically distributes and balances clusters and shards across all connected instances

### Terminology
- **Instance**: A bot deployment (StandaloneInstance, ManagedInstance) that manages clusters
- **Cluster**: A process group within an instance that manages shards
- **Shard**: Discord gateway connection for a portion of guilds
- **Bridge**: Centralized coordinator for multi-instance deployments

## Integration with Discord.js

galactic is fully compatible with the latest version of discord.js.  
You can integrate it without modifying your existing command or event handling structure.

## Use Cases

- Running high-traffic bots with thousands of guilds
- Horizontal scaling using containers (Docker, Kubernetes)
- Efficient utilization of hardware on a single machine

## License

MIT © 2025 GalaxyBot
