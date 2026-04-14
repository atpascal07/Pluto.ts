import {Client, ClientOptions, GatewayIntentsString} from "discord.js";
import {EventManager} from "../../general/EventManager";

export class ClusterClient extends Client {
    private details: ClusterClientDetails;
    private eventManager: EventManager;

    private readonly eventMap: {
        'message': ((message: unknown) => void) | undefined,
        'request': ((message: unknown, resolve: (data: unknown) => void, reject: (error: any) => void) => void) | undefined,
        'CLUSTER_READY': (() => void) | undefined,
    } = {
        message: undefined, request: undefined, CLUSTER_READY: undefined,
    }

    constructor(options: DiscordClientOptions) {
        const env = ClusterClient.getOptionsByProcessEnv()
        super({
            ...options,
           ...env.options
        });
        this.details = env.details

        this.eventManager = new EventManager((message: unknown) => {
            return new Promise((resolve, reject) => {
                if (typeof process.send !== 'function') {
                    reject(new Error("Process does not support sending messages"));
                    return;
                }

                process.send?.(message, undefined, undefined, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
        }, (message: unknown) => {
            this._onMessage(message);
        }, (message: unknown) => {
            return this._onRequest(message);
        });
        process.on("message", (message) => {
            this.eventManager.receive(message);
        })
    }

    private _onMessage(message: unknown): void {
        const m = message as { type: string, data: unknown };
        if(m.type == 'CUSTOM' && this.eventMap.message) {
            this.eventMap.message!(m.data);
        }
    }

    private _onRequest(message: unknown): unknown {
        const m = message as { type: string, data: unknown };
        if(m.type == 'CUSTOM' && this.eventMap.request) {
            return new Promise((resolve, reject) => {
                this.eventMap.request!(m.data, resolve, reject);
            });
        } else if(m.type == 'CLUSTER_HEARTBEAT'){

        } else if(m.type == 'BROADCAST_EVAL') {
            const broadcast = message as { type: 'BROADCAST_EVAL', data: string }

            const fn = eval(`(${broadcast.data})`);

            const result = fn(this);
            if (result instanceof Promise) {
                return new Promise((resolve, reject) => {
                    result.then(res => {
                        resolve(res);
                    }).catch(err => {
                        reject(err);
                    });
                });
            } else {
                return result;
            }
        }
        return undefined;
    }

    private static getOptionsByProcessEnv(): {
        options: ClusterClientOptions;
        details: ClusterClientDetails;
    } {
        return {
            options: {
                shards: [0],
                shardCount: 1,
                intents: []
            },
            details: {
                instanceID: 0,
                clusterID: 0,
                token: '^'
            }
        }
    }
}

export type ClusterClientDetails = {
    instanceID: number;

    clusterID: number;

    token: string;
}

export type ClusterClientOptions = {
    shards: number[];

    shardCount: number;

    intents: GatewayIntentsString[];
}

export type DiscordClientOptions = Omit<ClientOptions, 'shards' | 'shardCount' | 'intents'>;