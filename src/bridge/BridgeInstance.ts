import {BridgeCluster} from "./BridgeCluster";
import {Connection} from "net-ipc";
import {EventManager} from "../general/EventManager";

export enum BridgeInstanceStatus {
    READY = 'ready',
    PENDING_STOP = 'pending_stop',
}

export class BridgeInstance {
    public readonly id: number;
    public status: BridgeInstanceStatus;
    public readonly connection: Connection;
    public readonly eventManager: EventManager;
    public readonly dev: boolean;
    private readonly data: unknown;

    private _onMessage?: (message: unknown) => void;
    private _onRequest?: (message: unknown) => unknown;

    constructor(id: number, connection: Connection, dev: boolean, data: unknown) {
        this.id = id;
        this.status = BridgeInstanceStatus.READY;
        this.connection = connection;
        this.dev = dev;
        this.data = data;
        this.eventManager = new EventManager((message) => {
            if(!this.connection?.connection?.closed){
                return this.connection.send(message);
            }
            return Promise.reject(new Error('Connection is closed, cannot send message'));
        }, (message) => {
            if (this._onMessage) {
                this._onMessage(message);
            }
        }, (message) => {
            if (this._onRequest) {
                return this._onRequest(message);
            }
            return undefined;
        })
    }

    messageReceive(message: any) {
        this.eventManager.receive(message);
    }

    onRequest(callback: (message: unknown) => unknown) {
        this._onRequest = callback;
    }

    onMessage(callback: (message: unknown) => void) {
        this._onMessage = callback;
    }
}