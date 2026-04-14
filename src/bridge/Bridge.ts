import {GatewayIntentsString} from "discord.js";
import {Server, ServerOptions} from "net-ipc";
import {BridgeInstance} from "./BridgeInstance";
import {BridgeCluster, BridgeClusterStatus} from "./BridgeCluster";
import {ClusterUtil} from "../utils/ClusterUtil";
import {z} from "zod";

export class Bridge {
    public readonly server: Server;
    public readonly clientOptions: BridgeClusterClientOptions;

    private readonly _instances: BridgeInstance[];
    private readonly _clusters: BridgeCluster[];

    private readonly totalShards: number;

    constructor(serverOptions: ServerOptions, clientOptions: BridgeClusterClientOptions, shardsPerCluster: number, clusterToStart: number, reclusteringTimeoutInMs: number) {
        this.server = new Server(serverOptions);
        this.clientOptions = clientOptions
        this.totalShards = shardsPerCluster

        this._instances = []
        this._clusters = ClusterUtil.calculateClusters(clusterToStart, shardsPerCluster);

        this.server.start().then(() => {
            this.startListening();
        })

        this.interval();
    }

    getUnconnectedCluster() {
        return this.clusters.filter(c => !c.instance)
    }

    private interval(): void {
        setInterval(() => {
            const unconnected = this.getUnconnectedCluster()
            if (unconnected.length > 0) {
                const instance = ClusterUtil.getInstanceWithLowestLoad(this.instances)
                if(instance) {
                    console.log("start", instance.id, unconnected[0].id)
                    this.start(instance, unconnected[0])
                }
            }
        }, 1000 * 5)
    }

    private startListening() {
        this.server.on('connect', (connection, data) => {
            const payload = BridgeConnectionPayload.safeParse(data);
            if(payload.success) {
                if(this.instances.find(i => i.id === payload.data.id)) {
                    connection.close("Already connected", false)
                    return
                }
                const instance = new BridgeInstance(payload.data.id, connection, payload.data.dev, payload.data.data);
                this._instances.push(instance);
            } else {
                connection.close("Invalid payload", false)
            }
        })

        this.server.on('disconnect', (connection, reason) => {
            const instance = this._instances.find(i => i.connection === connection);
            if(!instance) {
                return
            }

            instance.clusters.forEach(cluster => {
                cluster.instance = undefined;
            })
            this.removeInstance(instance)
        })
    }

    removeInstance(instance: BridgeInstance) {
        const index = this._instances.indexOf(instance);
        if (index !== -1) {
            this._instances.splice(index, 1);
        }
    }

    get clusters() {
        return this._clusters;
    }

    get instances() {
        return this._instances;
    }

    start(instance: BridgeInstance, cluster: BridgeCluster) {
        cluster.instance = instance;
        cluster.status = BridgeClusterStatus.STARTING
        instance.eventManager.send<BridgeClusterEventCreateCluster>({
            type: 'CLUSTER_CREATE',
            data: {
                clusterID: cluster.id,
                instanceID: instance.id,
                shardList: cluster.shards.map(s => s.id),
                token: this.clientOptions.token,
                intents: this.clientOptions.intents,
                url: this.clientOptions.url,
                totalShards: this.totalShards,
            }
        });
    }
}

export type BridgeClusterClientOptions = {
    intents: GatewayIntentsString[];
    token: string;
    url?: string
}

export const BridgeConnectionPayload = z.object({
    id: z.number(),
    dev: z.boolean(),
    data: z.unknown()
})

export const BridgeClusterEventCreateCluster = z.object({
    type: 'CLUSTER_CREATE',
    data: z.object({
        clusterID: z.number(),
        instanceID: z.number(),
        shardList: z.array(z.number()),
        token: z.string(),
        intents: z.array(z.string()),
        url: z.string().optional(),
        totalShards: z.number(),
    })
})

export type BridgeClusterEventCreateCluster = z.infer<typeof BridgeClusterEventCreateCluster>