import {BridgeCluster, BridgeClusterStatus} from "../bridge/BridgeCluster";
import {BridgeClusterShard} from "../bridge/BridgeClusterShard";
import {BridgeInstance, BridgeInstanceStatus} from "../bridge/BridgeInstance";

export class ClusterUtil {
    static calculateClusters(clusterToStart: number, shardsPerCluster: number) {
        const clustersMap: Map<number, number[]> = new Map();
        for (let i = 0; i < clusterToStart; i++) {
            clustersMap.set(i, []);
            for (let j = 0; j < shardsPerCluster; j++) {
                clustersMap.get(i)?.push(i * shardsPerCluster + j);
            }
        }

        const clusters: BridgeCluster[] = [];
        for (let [id, shards] of clustersMap.entries()) {
            clusters.push(new BridgeCluster(id, shards.map(s => new BridgeClusterShard(s))));
        }
        return clusters
    }

    static getInstanceWithLowestLoad(instances: BridgeInstance[], clusters: BridgeCluster[]): BridgeInstance | undefined {
        let lowestLoadClient: BridgeInstance | undefined;
        let lowestLoad = Infinity;

        for (const client of instances.filter(i =>
            i.status === BridgeInstanceStatus.READY && !i.dev)) {
            const instanceClusters = clusters.filter(c => c.instance?.id === client.id);

            const load = instanceClusters.length; // Assuming load is determined by the number of clusters assigned
            if (load < lowestLoad) {
                lowestLoad = load;
                lowestLoadClient = client;
            }
        }

        return lowestLoadClient; // Returns the client with the lowest load, or undefined if no clients are connected
    }
}