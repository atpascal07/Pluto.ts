import {Server} from 'net-ipc';
import {BridgeHostConnection, BridgeHostConnectionStatus} from "./BridgeHostConnection";
import {GatewayIntentsString, Snowflake} from "discord.js";
import {ClusterCalculator} from "./ClusterCalculator";
import {BridgeClusterConnection, BridgeClusterConnectionStatus, HeartbeatResponse} from "./BridgeClusterConnection";
import {ShardingUtil} from "../general/ShardingUtil";

export class Bridge {
    public readonly port: number;
    public readonly server: Server;
    public readonly connectedHosts: Map<string, BridgeHostConnection> = new Map();
    private readonly token: string;
    private readonly intents: GatewayIntentsString[];
    private readonly shardsPerCluster: number = 1;
    private readonly clusterToStart: number = 1
    private readonly reclusteringTimeoutInMs: number;

    private readonly clusterCalculator: ClusterCalculator;

    private readonly eventMap: BridgeEventListeners = {
        CLUSTER_READY: undefined, CLUSTER_HEARTBEAT_FAILED: undefined,
        CLUSTER_STOPPED: undefined, HOST_CONNECTED: undefined, HOST_DISCONNECTED: undefined,
        CLUSTER_SPAWNED: undefined, CLUSTER_RECLUSTER: undefined, ERROR: undefined,
        HOST_STOP: undefined
    }

    constructor(port: number, token: string, intents: GatewayIntentsString[], shardsPerCluster: number, clusterToStart: number, reclusteringTimeoutInMs: number) {
        this.port = port;
        this.token = token;
        this.intents = intents;
        this.clusterToStart = clusterToStart;
        this.shardsPerCluster = shardsPerCluster;
        this.reclusteringTimeoutInMs = reclusteringTimeoutInMs;

        this.clusterCalculator = new ClusterCalculator(this.clusterToStart, this.shardsPerCluster);

        this.server = new Server({
            port: this.port,
        })
    }

    public start(): void {
        this.server.start().then(() => {
            this.startListening();
        })

        this.interval();
    }

    private interval(): void {
        setInterval(() => {
            this.checkCreate();
            this.checkRecluster();
            this.heartbeat();
        }, 5000)
    }

    private checkRecluster(): void {
        // check if all clusters are used
        const up = this.clusterCalculator.checkAllClustersConnected()
        if (!up) {
            return;
        }

        const connectedHosts: BridgeHostConnection[] = this.connectedHosts.values()
            .filter(c => c.connectionStatus == BridgeHostConnectionStatus.READY)
            .filter(c => !c.dev)
            .filter(c => c.establishedAt + this.reclusteringTimeoutInMs < Date.now())
            .toArray();

        const {most, least} = this.clusterCalculator.findMostAndLeastClustersForConnections(connectedHosts);
        if (most) {
            const clusterToSteal = this.clusterCalculator.getClusterForConnection(most)[0] || undefined;
            if (least && clusterToSteal) {
                clusterToSteal.reclustering(least);

                if (this.eventMap.CLUSTER_RECLUSTER) this.eventMap.CLUSTER_RECLUSTER(clusterToSteal, least, clusterToSteal.oldConnection!);
                this.createCluster(least, clusterToSteal, true);

                return;
            }
        }
    }

    private heartbeat(): void {
        const clusters = this.clusterCalculator.clusterList;

        clusters.forEach((cluster) => {
            if (cluster.connection && cluster.connectionStatus == BridgeClusterConnectionStatus.CONNECTED && !cluster.heartbeatPending) {
                cluster.heartbeatPending = true;
                cluster.connection.eventManager.request<HeartbeatResponse>({
                    type: 'CLUSTER_HEARTBEAT',
                    data: {
                        clusterID: cluster.clusterID
                    }
                }, 20000).then((r) => {
                    cluster.removeMissedHeartbeat();
                    cluster.heartbeatResponse = r;
                }).catch((err) => {
                    if (this.eventMap.CLUSTER_HEARTBEAT_FAILED) this.eventMap.CLUSTER_HEARTBEAT_FAILED(cluster, err)
                    cluster.addMissedHeartbeat()

                    if (cluster.missedHeartbeats > 7 && !cluster.connection?.dev) {
                        cluster.connection?.eventManager.send({
                            type: 'CLUSTER_STOP',
                            data: {
                                id: cluster.clusterID
                            }
                        });
                        cluster.connectionStatus = BridgeClusterConnectionStatus.DISCONNECTED;
                        cluster.resetMissedHeartbeats()
                    }
                }).finally(() => {
                    cluster.heartbeatPending = false;
                })
            }
        });
    }

    private checkCreate(): void {
        const optionalCluster = this.clusterCalculator.getNextCluster();

        if (!optionalCluster) {
            return;
        }

        const lowestLoadClient = this.clusterCalculator.getClusterWithLowestLoad(this.connectedHosts);
        if (!lowestLoadClient) {
            return;
        }

        this.createCluster(lowestLoadClient, optionalCluster)
    }

    private createCluster(connection: BridgeHostConnection, cluster: BridgeClusterConnection, recluster = false) {
        cluster.resetMissedHeartbeats()
        cluster.heartbeatResponse = undefined;
        if (!recluster) {
            cluster.setConnection(connection)
        } else {
            cluster.oldConnection?.eventManager.send({
                type: 'CLUSTER_RECLUSTER',
                data: {
                    clusterID: cluster.clusterID
                }
            })
        }
        if (this.eventMap.CLUSTER_SPAWNED) this.eventMap.CLUSTER_SPAWNED(cluster, connection)
        connection.eventManager.send({
            type: 'CLUSTER_CREATE',
            data: {
                clusterID: cluster.clusterID,
                instanceID: connection.instanceID,
                totalShards: this.getTotalShards(),
                shardList: cluster.shardList,
                token: this.token,
                intents: this.intents
            }
        });
    }

    public startListening(): void {
        this.server.on('connect', (connection, payload) => {
            const id = payload?.id;
            const data = payload.data as unknown;
            const dev = payload?.dev || false;
            if (!id) {
                connection.close('Invalid payload', false);
                return;
            }

            if (this.connectedHosts.values().some(client => client.instanceID === id)) {
                connection.close('Already connected', false);
                return;
            }

            const bridgeConnection = new BridgeHostConnection(payload.id, connection, data, dev);
            if (this.eventMap.HOST_CONNECTED) this.eventMap.HOST_CONNECTED(bridgeConnection);

            bridgeConnection.onMessage((m: any) => {
                if (m.type == 'CLUSTER_SPAWNED') {
                    const cluster = this.clusterCalculator.getClusterForConnection(bridgeConnection).find(c => c.clusterID === m.data.id);
                    if (cluster) {
                        cluster.connectionStatus = BridgeClusterConnectionStatus.STARTING;
                    }
                    return;
                }

                if (m.type == 'CLUSTER_READY') {
                    const cluster = this.clusterCalculator.getClusterForConnection(bridgeConnection).find(c => c.clusterID === m.data.id);
                    if (cluster) {
                        cluster.startedAt = Date.now();
                        if (this.eventMap.CLUSTER_READY) this.eventMap.CLUSTER_READY(cluster, m.data.guilds || 0, m.data.members || 0);
                        cluster.connectionStatus = BridgeClusterConnectionStatus.CONNECTED;
                        if (cluster.oldConnection) {
                            cluster.oldConnection.eventManager.send({
                                type: 'CLUSTER_STOP',
                                data: {
                                    id: cluster.clusterID
                                }
                            });
                            cluster.oldConnection = undefined;
                        }
                    }
                    return;
                }

                if (m.type == 'CLUSTER_STOPPED') {
                    const cluster = this.clusterCalculator.getClusterForConnection(bridgeConnection).find(c => c.clusterID === m.data.id);
                    if (cluster) {
                        cluster.startedAt = undefined;
                        if (this.eventMap.CLUSTER_STOPPED) this.eventMap.CLUSTER_STOPPED(cluster);
                        cluster.setConnection(undefined);
                    }
                    return;
                }

                if (m.type == "INSTANCE_STOP") {
                    this.stopInstance(bridgeConnection);
                }

                return;
            })

            bridgeConnection.onRequest((m: any) => {
                if (m.type == 'REDIRECT_REQUEST_TO_GUILD') {
                    const guildID = m.guildID;
                    const shardID = ShardingUtil.getShardIDForGuild(guildID, this.getTotalShards());
                    const cluster = this.clusterCalculator.getClusterOfShard(shardID);
                    if (!cluster) {
                        return Promise.reject(new Error("cluster not found"))
                    }
                    if (cluster.connectionStatus != BridgeClusterConnectionStatus.CONNECTED) {
                        return Promise.reject(new Error("cluster not connected."))
                    }

                    if (!cluster.connection?.eventManager) {
                        return Promise.reject(new Error("no connection defined."))
                    }

                    return cluster.connection.eventManager.request({
                        type: 'REDIRECT_REQUEST_TO_GUILD',
                        clusterID: cluster.clusterID,
                        guildID: guildID,
                        data: m.data
                    }, 5000)
                }

                if (m.type == 'BROADCAST_EVAL') {
                    const responses = Promise.all(
                        this.connectedHosts.values().map(c => {
                            return c.eventManager.request<unknown[]>({
                                type: 'BROADCAST_EVAL',
                                data: m.data,
                            }, 5000);
                        })
                    )
                    return new Promise<unknown[]>((resolve, reject) => {
                        responses.then((r) => {
                            resolve(r.flatMap(f => f))
                        }).catch(reject);
                    })
                }

                if (m.type == 'SELF_CHECK') {
                    return {
                        clusterList: [
                            ...this.clusterCalculator.getClusterForConnection(bridgeConnection).map(c => c.clusterID),
                            ...this.clusterCalculator.getOldClusterForConnection(bridgeConnection).map(c => c.clusterID)
                        ]
                    }
                }

                return Promise.reject(new Error("unknown type"))
            })

            this.connectedHosts.set(connection.id, bridgeConnection)
        });

        this.server.on('disconnect', (connection, reason) => {
            const closedConnection = this.connectedHosts.get(connection.id);
            if (!closedConnection) {
                return;
            }

            const clusters = this.clusterCalculator.getClusterForConnection(closedConnection);
            for (const cluster of clusters) {
                this.clusterCalculator.clearClusterConnection(cluster.clusterID);
            }

            if (this.eventMap.HOST_DISCONNECTED) this.eventMap.HOST_DISCONNECTED(closedConnection, reason);
            this.connectedHosts.delete(connection.id);
        });

        this.server.on("message", (message, connection) => {
            this.sendMessageToClient(connection.id, message);
        })
    }

    sendMessageToClient(clientId: string, message: unknown): void {
        if (!this.connectedHosts.has(clientId)) {
            return;
        }

        const client = this.connectedHosts.get(clientId);
        if (client) {
            client.messageReceive(message);
        }
    }

    private getTotalShards() {
        return this.shardsPerCluster * this.clusterToStart;
    }


    public on<K extends keyof BridgeEventListeners>(event: K, listener: BridgeEventListeners[K]): void {
        this.eventMap[event] = listener;
    }

    public getClusters() {
        return this.clusterCalculator.clusterList;
    }

    async stopAllInstances() {
        const instances = Array.from(this.connectedHosts.values());
        for (const instance of instances) {
            instance.connectionStatus = BridgeHostConnectionStatus.PENDING_STOP;
        }

        for (const instance of instances) {
            await this.stopInstance(instance, false);
        }
    }

    async stopAllInstancesWithRestart() {
        const instances = Array.from(this.connectedHosts.values());

        for (const instance of instances) {
            await this.stopInstance(instance);
            await new Promise<void>((resolve) => {
                setTimeout(async () => {
                    resolve();
                }, 1000 * 10);
            })
        }
    }

    async moveCluster(instance: BridgeHostConnection, cluster: BridgeClusterConnection) {
        cluster.reclustering(instance);

        this.createCluster(instance, cluster, true);
    }

    async stopInstance(bridgeConnection: BridgeHostConnection, recluster = true) {
        if (this.eventMap.HOST_STOP) this.eventMap.HOST_STOP(bridgeConnection);
        bridgeConnection.connectionStatus = BridgeHostConnectionStatus.PENDING_STOP;

        let clusterToSteal: BridgeClusterConnection | undefined;

        await bridgeConnection.eventManager.send({
            type: 'INSTANCE_STOP'
        });

        if (recluster && this.connectedHosts.size > 1) {
            while ((clusterToSteal = this.clusterCalculator.getClusterForConnection(bridgeConnection).filter(c =>
                c.connectionStatus === BridgeClusterConnectionStatus.CONNECTED ||
                c.connectionStatus == BridgeClusterConnectionStatus.STARTING ||
                c.connectionStatus == BridgeClusterConnectionStatus.RECLUSTERING)[0]) !== undefined) {
                // skip if the cluster is not connected
                if (clusterToSteal.connectionStatus != BridgeClusterConnectionStatus.CONNECTED) break;

                const least = this.clusterCalculator.getClusterWithLowestLoad(this.connectedHosts);
                if (!least) {
                    if (this.eventMap.ERROR) {
                        this.eventMap.ERROR("Reclustering failed: No least cluster found.");
                    }
                    await bridgeConnection.eventManager.send({
                        type: 'CLUSTER_STOP',
                        data: {
                            id: clusterToSteal.clusterID
                        }
                    });
                    clusterToSteal.connection = undefined;
                    clusterToSteal.connectionStatus = BridgeClusterConnectionStatus.DISCONNECTED;
                    continue;
                }

                clusterToSteal.reclustering(least);

                if (this.eventMap.CLUSTER_RECLUSTER) {
                    this.eventMap.CLUSTER_RECLUSTER(clusterToSteal, least, clusterToSteal.oldConnection!);
                }

                this.createCluster(least, clusterToSteal, true);
            }

            return new Promise<void>((resolve, reject) => {
                const interval = setInterval(async () => {
                    const cluster = this.clusterCalculator.getOldClusterForConnection(bridgeConnection)[0] || undefined;
                    if (!cluster) {
                        clearInterval(interval);
                        await bridgeConnection.eventManager.send({
                            type: 'INSTANCE_STOPPED'
                        })
                        await bridgeConnection.connection.close("Instance stopped.", false);
                        resolve();
                        return;
                    }
                }, 1000);
            })
        } else {
            const clusters = this.clusterCalculator.getClusterForConnection(bridgeConnection);
            for (const cluster of clusters) {
                await bridgeConnection.eventManager.send({
                    type: 'CLUSTER_STOP',
                    data: {
                        id: cluster.clusterID
                    }
                });
            }
            await bridgeConnection.eventManager.send({ type: 'INSTANCE_STOPPED' });

            if(this.eventMap.HOST_DISCONNECTED) this.eventMap.HOST_DISCONNECTED(bridgeConnection, "Instance stopped");
            await bridgeConnection.connection.close("Instance stopped.", false);
            this.connectedHosts.delete(bridgeConnection.connection.id);
        }
    }

    sendRequestToGuild(cluster: BridgeClusterConnection, guildID: Snowflake, data: unknown, timeout = 5000): Promise<unknown> {
        if (!cluster.connection) {
            return Promise.reject(new Error("No connection defined for cluster " + cluster.clusterID));
        }

        return cluster.connection.eventManager.request({
            type: 'REDIRECT_REQUEST_TO_GUILD',
            clusterID: cluster.clusterID,
            guildID: guildID,
            data: data
        }, timeout);
    }
}

export type BridgeEventListeners = {
    'CLUSTER_READY': ((cluster: BridgeClusterConnection, guilds: number, members: number) => void) | undefined,
    'CLUSTER_STOPPED': ((cluster: BridgeClusterConnection) => void) | undefined,
    'CLUSTER_SPAWNED': ((cluster: BridgeClusterConnection, connection: BridgeHostConnection) => void) | undefined,
    'CLUSTER_RECLUSTER': ((cluster: BridgeClusterConnection, newConnection: BridgeHostConnection, oldConnection: BridgeHostConnection) => void) | undefined,
    'CLUSTER_HEARTBEAT_FAILED': ((cluster: BridgeClusterConnection, error: unknown) => void) | undefined,
    'HOST_CONNECTED': ((client: BridgeHostConnection) => void) | undefined,
    'HOST_DISCONNECTED': ((client: BridgeHostConnection, reason: string) => void) | undefined,
    'ERROR': ((error: string) => void) | undefined,
    'HOST_STOP': ((instance: BridgeHostConnection) => void) | undefined
};