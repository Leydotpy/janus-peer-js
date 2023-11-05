// import {RemoteVideoTrack, RemoteAudioTrack} from "twilio-video";
import {util} from "./util.ts";
import logger from "./logger.ts";
import {ConnectionType, ServerMessageType} from "./enums.ts";
import {Peer} from "./peer.ts";
import {Negotiator} from "./negotiator.ts";
import {BaseConnection} from "./baseconnection.ts";
import {ServerMessage} from "./servermessage.ts";
import {AnswerOption, CallOption, ServerPayload} from "./optionInterfaces.ts";
import {LocalStream} from "../stream";
import {createRemoteStream} from "../utils/getUserMedia.ts";


export type MediaConnectionEvents = {
    stream: (stream: MediaStream) => void
    willCloseOnRemote: () => void
}

export type MediaConnectionOptions = {
    _stream?: LocalStream;
    connectionId?: string;
    _payload?: ServerPayload;
    constraints?: RTCOfferOptions;
} & CallOption

export class MediaConnection extends BaseConnection<MediaConnectionEvents> {
    private static readonly ID_PREFIX = "mc_";
    // @ts-ignore
    readonly label: string;

    private _negotiator: Negotiator<MediaConnectionEvents, MediaConnection>;
    private _localstream: LocalStream;

    get type(){
        return ConnectionType.Media
    }
    get localstream() {
        return this._localstream
    }
    // get remotestream(): MediaStream {
    //     return this._remotestream
    // }
    constructor(provider: Peer, options: MediaConnectionOptions) {
        super(provider, options);
        this._localstream = this.options._stream;
        this.connectionId = this.options.connectionId || MediaConnection.ID_PREFIX + util.randomToken();
        this._negotiator = new Negotiator(this)
        if (this._localstream){
            this._negotiator.startConnection({
                _stream: this._localstream,
                originator: true,
                src: options.src
            })
        }
    }
    public addStream = async (stream: MediaStream) => {
        logger.log("Receiving stream", stream);
        this.provider._addTracks(await createRemoteStream(stream))
    }

    public removeStream = (streamId: string) => {
        logger.log(streamId)
    }

    public handleMessage = (msg: ServerMessage) => {
        const type = msg.type;
        const payload = msg.payload;

        switch (msg.type) {
            case ServerMessageType.Answer:
                this._negotiator.handleSDP(type, payload.sdp);
                this._open = true;
                break;
            default:
                logger.warn(`Unrecognized message type:${type} from server`);
                break;
        }
    }

    public close = () => {
        if (this._negotiator){
            this._negotiator.cleanup();
            // @ts-ignore
            this._negotiator = null
        }

        // @ts-ignore
        this._localstream = null
        // @ts-ignore
        this._remotestream = null

        if (this.provider){
            this.provider._removeConnection(this);
            // @ts-ignore
            this.provider = null;
        }

        if (this.options && this.options._stream) {
            this.options._stream = null;
        }

        if (!this.open) return;

        this._open = false;

        super.emit("close");
    }

    public answer = (options: AnswerOption = {}) => {
        if (options && options.sdpTransform) {
            this.options.sdpTransform = options.sdpTransform;
        }

        this._negotiator.startConnection({
           ...this.options._payload,
        });

        const messages = this.provider._getMessages(this.connectionId);
        logger.log(`message from ${this.connectionId}`, messages)
        for (const message of messages) {
            this.handleMessage(message)
        }

        this._open = true
    }
    // @ts-ignore
    override _initializeDataChannel(dc: RTCDataChannel) {}
}