import dotenv from "dotenv";
import {Bridge} from "../src/bridge/Bridge";

dotenv.config();


const bridge = new Bridge({
        port: 3000
    },
    {
        token: process.env.TEST_BOT_TOKEN!,
        intents: [
            "Guilds"
        ]
    },
    2
    , 2,
    Number.parseInt(process.env.RECLUSTERING_TIMEOUT_IN_MS!)
)

bridge.on('CLUSTER_READY', (client) => {
    console.log(`Cluster ${client.id} is ready with shards: ${client.shards.map(s => s.id).join(', ')}`);
});
bridge.on('CLUSTER_STOPPED', (client) => {
    console.log(`Cluster stopped ${client.id}`);
});

bridge.on('CLUSTER_SPAWNED', (client) => {
    console.log(`Cluster spawned ${client.id}`);
});

bridge.on('INSTANCE_DISCONNECTED', (client) => {
    console.log(`Instance disconnected ${client.id}`);
})

bridge.on('INSTANCE_CONNECTED', (client) => {
    console.log(`Instance connected ${client.id}`);
})


/**
 *
 *
 * bridge.instances.values().map(c => c.data);
 *
 * bridge.on('CLUSTER_READY', (client) => {
 *     console.log(`Cluster ${client.clusterID} is ready with shards: ${client.shardList.join(', ')}`);
 * });
 * bridge.on('CLUSTER_STOPPED', (client) => {
 *     console.log(`Cluster stopped ${client.clusterID}`);
 * });
 *
 * bridge.on('CLUSTER_SPAWNED', (client) => {
 *     console.log(`Cluster spawned ${client.clusterID}`);
 * });
 *
 *
 * process.stdin.resume();
 * process.stdin.setEncoding('utf8');
 * process.stdin.on('data', async function (text: Buffer) {
 *     const input = text.toString().trim().split(" ");
 *
 *     if (input[0] == 'stop') {
 *         bridge.stopInstance(bridge.connectedInstances.values().next().value!).then((result) => {
 *             console.log("Stopped instance:", result);
 *         });
 *     } else if (input[0] == 'move') {
 *         const instanceID = parseInt(input[1]);
 *         const clusterID = parseInt(input[2]);
 *
 *         const instance = bridge.connectedInstances.values().find(c => c.instanceID === instanceID);
 *         const cluster = bridge.getClusters().find(c => c.clusterID === clusterID);
 *         bridge.moveCluster(instance!, cluster!).then((result) => {
 *             console.log("Moved cluster:", result);
 *         }).catch((error) => {
 *             console.error("Error moving cluster:", error);
 *         });
 *     }
 * });
 */