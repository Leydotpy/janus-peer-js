import {util} from "./util.ts";
import {API} from "./api";
import logger, {LogLevel} from "./logger.ts";
import {Socket} from "./socket";
import {EventEmitter} from "eventemitter3";
import {MediaConnection} from "./mediaconnection.ts";
import {ConnectionType, PeerErrorType, ServerMessageType, SocketEventType} from "./enums.ts";
import {ServerMessage} from "./servermessage.ts";
import {CallOption, PeerJSOption} from "./optionInterfaces.ts";
import {DataConnection} from "./dataconnection/DataConnection.ts";
import {LocalStream, RemoteStream} from "../stream";
import {RemoteTrack} from "../stream/remotetrack.ts";
import {Participant} from "./optionInterfaces.ts";

class PeerOptions implements PeerJSOption {
    debug?: LogLevel;
    /**
     * Server host. Defaults to `0.peerjs.com`.
     * Also accepts `'/'` to signify relative hostname.
     */
    host?: string;
    /**
     * Server port. Defaults to `443`.
     */
    port?: number;
    /**
     * Group path for the PeerServer.
     * This is not used anymore.
     * @deprecated
     */
    path?: string;
    groupId?: string;
    pin?: string;
    config?: any;
    secure?: any;
    pingInterval?: number;
    referrerPolicy?: ReferrerPolicy;
    logFunction?: (logLevel: LogLevel, ...rest: unknown[]) => void;
    serializers?: SerializerMapping;
}

export type { PeerError, PeerOptions };

export type SerializerMapping = {
    [key: string]: new (
        peerId: string,
        provider: Peer,
        options: any,
    ) => DataConnection;
};

class PeerError extends Error {
    constructor(type: PeerErrorType, err: Error | string) {
        if (typeof err === "string") {
            super(err);
        } else {
            super();
            Object.assign(this, err);
        }

        this.type = type;
    }

    type: PeerErrorType;
}

export type PeerEvents = {
    /**
     * Emitted when a connection to the PeerServer is established.
     *
     * You may use the peer before this is emitted, but messages to the server will be queued. <code>id</code> is the brokering ID of the peer (which was either provided in the constructor or assigned by the server).<span class='tip'>You should not wait for this event before connecting to other peers if connection speed is important.</span>
     */
    open: (id: string) => void;
    /**
     * Emitted when a new data connection is established from a remote peer.
     */
    connection: (dataConnection: DataConnection) => void;
    /**
     * Emitted when a new participant joins the room
     * */
    participant: (participant: Participant) => void;
    /**
     * Emitted when a remote track is received.
     */
    tracks: (tracks: RemoteTrack[]) => void;
    /**
     * Emitted when the peer is destroyed and can no longer accept or create any new connections.
     */
    close: () => void;
    /**
     * Emitted when the peer is disconnected from the signalling server
     */
    disconnected: (currentId: string) => void;
    /**
     * Errors on the peer are almost always fatal and will destroy the peer.
     *
     * Errors from the underlying socket and PeerConnections are forwarded here.
     */
    error: (error: PeerError) => void;
};

export class Peer extends EventEmitter<PeerEvents>{
    private readonly _options: PeerOptions
    private readonly _api: API;
    private readonly _socket: Socket;
    private _id: string | null = null;
    private _lastServerId: string | null = null;
    // States
    private _destroyed = false;
    private _disconnected = false;
    private _open = false;
    private readonly _participants: Map<string, Participant> = new Map()
    private readonly _tracks: Map<string, RemoteTrack[]> = new Map()
    private readonly _connections: Map<string, MediaConnection> = new Map()
    private readonly  _lostMessages: Map<string, ServerMessage[]> = new Map()
    get id(){
        return this._id
    }
    get options(){
        return this._options
    }
    get socket(){
        return this._socket
    }
    get open() {
        return this._open
    }

    get participants() {
        return this._participants.values()
    }
    get connections(): Object {
        const plainConnections = Object.create(null)
        for (const [k, v] of this._connections) {
            plainConnections[k] = v
        }
        return plainConnections
    }
    get destroyed() {
        return this._destroyed
    }
    get disconnected() {
        return this._disconnected
    }
    get api(){
        return this._api
    }

    get tracks(){
        return Array.from(this._tracks.values()).flat()
    }

    constructor();
    constructor(options: PeerOptions);
    constructor(groupId: string, options?: PeerOptions);
    constructor(id?: string | PeerOptions, options?: PeerOptions) {
        super()
        let groupId: string | undefined;

        if (id && id.constructor == Object){
            options = id as PeerOptions
        } else if (id){
            groupId = id.toString();
        }

        options = {
            debug: 0,
            host: util.CLOUD_HOST,
            port: util.CLOUD_PORT,
            groupId: groupId,
            config: util.defaultConfig,
            referrerPolicy: "strict-origin-when-cross-origin",
            serializers: {},
            ...options
        }

        this._options = options;

        if (this._options.host === "/") {
            this._options.host = window.location.hostname;
        }

        if (
            this._options.secure === undefined &&
            this._options.host !== util.CLOUD_HOST
        ){
            this._options.secure = util.isSecure();
        } else if (this._options.host == util.CLOUD_HOST) {
            this._options.secure = true;
        }

        if (this._options.logFunction){
            logger.setLogFunction(this._options.logFunction);
        }

        logger.logLevel = this._options.debug || 0;

        this._api = new API(options);
        // TODO: RECHECK SOCKET CONNECTION TO THE BACKEND
        this._socket = this._createServerConnection()

        if (!util.supports.audioVideo && !util.supports.data) {
            this.delayedAbort(PeerErrorType.BrowserIncompatible,
                "The current browser does not support WebRTC"
            );
            return
        }

        if (!this._options.groupId) {
            this.delayedAbort(PeerErrorType.InvalidID, "No groupId was specified")
            return;
        }
        this._initialize(this._options.groupId)
    }
    private _initialize = (id: string) => {
        this._socket.start(id)
    }
    public getConnection = (connectionId: string): MediaConnection | null => {
        const connection = this._connections.get(connectionId);
        if (!connection) return null;
        return connection;
    }
    public emitError = (type: PeerErrorType, err: string | Error) => {
        logger.error("Error:", err)
        this.emit("error", new PeerError(type, err))
    }
    public _removeConnection = (conn: MediaConnection | DataConnection) => {
        const connection = this.getConnection(conn.connectionId)
        if (connection) {
            this._connections.delete(connection.connectionId)
            this._lostMessages.delete(conn.connectionId)
        }
    }
    public _updateConnection = (oldConnectionId: string, newConnectionId: string) => {
        const connection = this.getConnection(oldConnectionId)
        if (connection) {
            const lostMessages = this._lostMessages.get(oldConnectionId)
            this._removeConnection(connection);
            connection.setConnectionId(newConnectionId);
            logger.log(newConnectionId === connection.connectionId)
            this._addConnection(connection.connectionId, connection);
            if (lostMessages){
                for (const lostMessage of lostMessages) {
                    this._storeMessage(newConnectionId, lostMessage)
                }
            }
        }
        const errorMessage = `cannot find connection with the specified id:${oldConnectionId}`
        logger.log(errorMessage); this.emitError(PeerErrorType.InvalidID, errorMessage)
        throw new Error(errorMessage)

    }
    private _createServerConnection = () => {
        const socket = new Socket(
            this._options.secure,
            this._options.host!,
            this._options.port!,
            this._options.pingInterval,
        );

        socket.on(SocketEventType.Message, this._onsocketmessage);
        socket.on(SocketEventType.Error, this._onsocketerror);
        socket.on(SocketEventType.Disconnected, this._onsocketdisconnected);
        socket.on(SocketEventType.Close, this._onsocketclosed);
        return socket;
    }
    private delayedAbort = (errorType: PeerErrorType, message: string) => {
        setTimeout(() => {
            this._abort(errorType, message)
        }, 0)
    }
    public _getMessages = (connectionId: string): ServerMessage[] => {
        const messages = this._lostMessages.get(connectionId);
        if (messages) {
            this._lostMessages.delete(connectionId);
            return messages
        }
        return [];
    }
    private _addConnection = (connectionId: string, connection: MediaConnection) => {
        logger.log(`${connection.type} Connection added to this peer: ${connectionId}`)
        if (!this._connections.has(connectionId)) {
            this._connections.set(connectionId, connection)
        }
    }
    public _addTracks = (stream: RemoteStream) => {
        if (this._tracks.has(stream.id)) return;
        this._tracks.set(stream.id, <RemoteTrack[]>stream.getTracks())
        this.emit("tracks", <RemoteTrack[]>stream.getTracks())
    }
    private _storeMessage = (connectionId: string, message: ServerMessage) => {
        if (!this._lostMessages.has(connectionId)) {
            this._lostMessages.set(connectionId, []);
        }

        this._lostMessages?.get(connectionId)?.push((message));
    }
    private _add_participant = (participant: Participant) => {
        if (this._participants.has(participant.participant_id)) return;
        this._participants.set(participant.participant_id, participant);
        this.emit("participant", participant)
    }
    private _onsocketmessage = (message: ServerMessage) => {
        const type = message.type;
        const payload = message.payload;
        const peerId = message.src

        switch (type) {
            case ServerMessageType.Open:
                this._lastServerId = this.id;
                this._open = true;
                this.emit("open", this.id!);
                break;
            case ServerMessageType.Offer: {
                const connectionId = payload.connectionId;
                let connection = this.getConnection(connectionId)

                if (connection) {
                    connection.close();
                    logger.warn(`Offer received for existing Connection ID:${connectionId}`)
                }

                if (payload.type === ConnectionType.Media) {
                    const mediaConnection = new MediaConnection(this, {
                        connectionId,
                        _payload: payload
                    });
                    connection = mediaConnection;
                    this._addConnection(connectionId, connection);
                    // this.emit("call", mediaConnection);
                    mediaConnection.answer({})
                } else {
                    logger.warn(`Received malformed connection type: ${payload.type}`)
                    return;
                }
                const messages = this._getMessages(connectionId);
                for (const message of messages) {
                    connection.handleMessage(message);
                }
                break;
            }
            case ServerMessageType.Participant:
                this._add_participant(payload.data)
                break
            default:
                if (!payload) logger.warn(`You received a malfunctioned message from ${peerId} of type ${type}`)
                const connectionId = payload.connectionId;
                const connection = this.getConnection(connectionId)
                if (connection && connection.peerConnection){
                    connection.handleMessage(message);
                } else if (connectionId) {
                    this._storeMessage(connectionId, message);
                } else {
                    logger.warn("You have received an unrecognized message:", message)
                }
                break
        }
    }
    private _onsocketdisconnected = () => {
        if (this.disconnected) return;
        this.emitError(PeerErrorType.Network, "Lost Connection to server.")
        this.disconnect();
    }
    private _onsocketclosed = () => {
        if (this.disconnected) return;
        this._abort(PeerErrorType.SocketClosed, "Underlying socket is already closed.")
    }
    private _onsocketerror = (error: string) => {
        this._abort(PeerErrorType.SocketError, error)
    }
    private _abort = (type: PeerErrorType, msg: string | Error) => {
        logger.error("Aborting!...");
        this.emitError(type, msg);
        this._lastServerId ? this.disconnect() : this.destroy();
    }
    public destroy = () => {
        if (this.destroyed) return;

        logger.log(`Destroy peer with ID: ${this.id}`);

        this.disconnect();
        this._cleanup();

        this._destroyed = true;

        this.emit("close");
    }
    private _cleanupPeer = (connectionId: string) => {
        const connection = this.getConnection(connectionId);
        if (!connection) return
        connection.close()
    }
    private _cleanup = () => {
        for (const key of this._connections.keys()) {
            this._cleanupPeer(key);
            this._connections.delete(key);
        }
        this.socket.removeAllListeners();
    }
    public disconnect = () => {
        if (this.disconnected) return;

        const currentId = this.id;

        logger.log(`Disconnect peer with ID: ${currentId}`);

        this._disconnected = true;
        this._open = false;

        this.socket.close();

        this._lastServerId = currentId;
        this._id = null;

        this.emit("disconnected", currentId!);
    }
    public publish = (stream: LocalStream, options: CallOption = {}) => {
        if (this.disconnected){
            logger.warn(
                "You cannot connect to a new Peer because you called " +
                ".disconnect() on this Peer and ended your connection with the " +
                "server. You can create a new Peer to reconnect.",
            )
            this.emitError(
                PeerErrorType.Disconnected,
                "Cannot connect to new Peer after disconnecting from server.",
            );
            return;
        }

        if (!stream) {
            logger.error(
                "To join the room, you must publish a stream from your browser"
            )
            return;
        }

        const mediaConnection = new MediaConnection(this, {
            ...options,
            _stream: stream,

        })
        this._addConnection(mediaConnection.connectionId, mediaConnection);
        return mediaConnection
    }
}