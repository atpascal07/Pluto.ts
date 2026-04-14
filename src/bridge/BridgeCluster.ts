import {BridgeClusterShard} from "./BridgeClusterShard";
import {BridgeInstance} from "./BridgeInstance";

export enum BridgeClusterStatus {
    STARTING = 'starting',
    CONNECTED = 'connected',
    RECLUSTERING = 'reclustering',
    DISCONNECTED = 'disconnected',
}

export class BridgeCluster {
    public readonly id: number;
    public readonly shards: BridgeClusterShard[];
    public status: BridgeClusterStatus;
    public instance?: BridgeInstance;

    constructor(id: number, shards: BridgeClusterShard[]) {
        this.id = id;
        this.shards = shards;
        this.status = BridgeClusterStatus.DISCONNECTED;
    }
}