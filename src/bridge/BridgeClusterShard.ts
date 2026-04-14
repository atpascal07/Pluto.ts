import {BridgeOld} from "./BridgeOld";

export class BridgeClusterShard {
    public readonly id: number;
    private readonly status: BridgeClusterShardStatus

    constructor(id: number) {
        this.id = id;
        this.status = 'disconnected'
    }
}

export type BridgeClusterShardStatus = 'connected' | 'disconnected'