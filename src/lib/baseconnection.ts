import {EventEmitter, ValidEventTypes} from "eventemitter3";
import {Peer} from "./peer";
import {ServerMessage} from "./servermessage";
import {ConnectionType} from "./enums.ts";

export type BaseConnectionEvents = {
    close: VoidFunction;
    error: (error: Error) => void;
    iceStateChanged: (state: RTCIceConnectionState) => void;
}

export abstract  class BaseConnection<
    T extends ValidEventTypes
> extends EventEmitter<T & BaseConnectionEvents>{
    protected _open = false;
    readonly metadata: any;
    // @ts-ignore
    connectionId: string;
    // @ts-ignore
    peerConnection: RTCPeerConnection;
    // @ts-ignore
    dataChannel: RTCDataChannel;

    abstract get type(): ConnectionType;
    // @ts-ignore
    label: string;
    get open(){return this._open};

    public setConnectionId = (connectionId: string) => {
        this.connectionId = connectionId
    }

    constructor(public provider: Peer, readonly options: any) {
        super();
        this.metadata = this.options.metadata;
    }

    abstract close(): void;
    abstract handleMessage(msg: ServerMessage): void;
    abstract _initializeDataChannel(dc: RTCDataChannel): void;
}