import { EventEmitter } from "eventemitter3";
import {SocketEventType, ServerMessageType} from "./enums.ts"
import logger from "./logger.ts";

export class Socket extends EventEmitter {
    private _disconnected: boolean = true;
    private _id?: string;
    private _messagesQueue: Array<object> = [];
    private _socket?: WebSocket;
    private _wsPingTimer?: any;
    private readonly  _baseUrl: string;

    constructor(
        secure: any,
        host: string,
        port: number,
        private readonly pingInterval: number = 5000,
    ) {
        super();
        const wsProtocol = secure ? "wss://" : "ws://";
        this._baseUrl = wsProtocol + host + ":" + port + "/ws/"
    }

    start = (id: string) => {
        if (!!this._socket || !this._disconnected) return;
        this._socket = new WebSocket(this._baseUrl + id + "/server")
        this._disconnected = false
        this._socket.onmessage = this._onmessage
        this._socket.onclose = this._onclose
        this._socket.onopen = this._onopen
    }

    private _cleanup = () => {
        if (this._socket){
            this._socket.onopen =
                this._socket.onmessage =
                    this._socket.onclose =
                        null;
            this._socket.close();
            this._socket = undefined
        }
        clearTimeout(this._wsPingTimer);
    }
    private _sendQueuedMessages = () => {
        const copiedQueue = [...this._messagesQueue];
        this._messagesQueue = [];

        for (const message of copiedQueue) {
            this.send(message);
        }
    }

    private _wsOpen(): boolean {
        return !!this._socket && this._socket.readyState === 1;
    }

    private _scheduleHeartbeat(): void {
        this._wsPingTimer = setTimeout(() => {
            this._sendHeartbeat();
        }, this.pingInterval);
    }

    private _sendHeartbeat(): void {
        if (!this._wsOpen()) {
            logger.log(`Cannot send heartbeat, because socket closed`);
            return;
        }

        const message = JSON.stringify({ type: ServerMessageType.Heartbeat });

        this._socket?.send(message);

        this._scheduleHeartbeat();
    }

    public send = (data: any) => {
        if (this._disconnected) return;

        if (!this._id) {
            this._messagesQueue.push(data);
            return;
        }

        if (!data.type){
            this.emit(SocketEventType.Error, "Invalid Message");
            return;
        }

        if (!this._wsOpen()) return;

        const message = JSON.stringify(data);
        this._socket?.send(message);

    }

    public close = () => {
        if (this._disconnected) return;

        this._cleanup();

        this._disconnected = true;
    }

    private _onmessage = (event: MessageEvent<any>) => {
        let data;

        try {
            data = JSON.parse(event.data);
        } catch (e) {
            return;
        }
        this.emit(SocketEventType.Message, data);
    }

    private _onclose = (event: CloseEvent) => {
        if (this._disconnected) return;

        logger.log("Socket closed.", event)

        this._cleanup();
        this._disconnected = true;

        this.emit(SocketEventType.Disconnected);
    }

    private _onopen = () => {
        if (this._disconnected) return;

        this._sendQueuedMessages();

        logger.log("socket open");

        this._scheduleHeartbeat();
    }
}