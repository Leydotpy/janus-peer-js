// import {RemoteAudioTrack} from "twilio-video";
import logger from "./logger.ts";
import {ConnectionType, PeerErrorType} from "./enums.ts";
import {BaseConnection} from "./baseconnection.ts";
import {ValidEventTypes} from "eventemitter3";
import {BaseConnectionEvents} from "./baseconnection.ts";
import {MediaConnection} from "./mediaconnection.ts";
import {util} from "./util.ts";
import {ServerMessage} from "./servermessage.ts";
import {ServerPayload} from "./optionInterfaces.ts";
import {LocalStream} from "../stream";


export type ConnectionOptions = {
    reliable?: boolean;
    originator?: boolean;
    _stream?: LocalStream;
    src?: "screen" | "media";
} & Partial<ServerPayload>

export class Negotiator<
    A extends ValidEventTypes,
    T extends BaseConnection<A | BaseConnectionEvents>
> {
    private _icecandidates: RTCIceCandidate[] = []
    constructor(readonly connection: T) {}
    public startConnection = (options: ConnectionOptions) => {
        const peerConnection = this._startPeerConnection();
        this.connection.peerConnection = peerConnection;

        if (this.connection.type === ConnectionType.Media && options._stream){
            this._addTracksToConnection(options._stream, peerConnection)
        }

        // TODO: Handle Data Connection to TextRoom via DataChannels
        if (options.originator){
            this._makeOffer(options.src === "screen");
        } else {
            this.handleSDP("OFFER", options.sdp)
        }
    }
    public handleSDP = async (type: string, sdp: any) => {
        sdp = new RTCSessionDescription(sdp);
        const peerConnection = this.connection.peerConnection;
        const provider = this.connection.provider;

        logger.log("Setting remote description", sdp);

        const self = this;

        try {
            await peerConnection.setRemoteDescription(sdp);
            logger.log(`Set remoteDescription:${type} for:${this.connection.connectionId}`);
            if (type === "OFFER") {
                await self._makeAnswer();
            }
        } catch (err) {
            provider.emitError(PeerErrorType.WebRTC, <Error>err);
            logger.log("Failed to setRemoteDescription, ", err);
        }
    }
    public handleCandidate = async (ice: RTCIceCandidate) => {
        logger.log('handleCandidate:', ice)
        try {
            await this.connection.peerConnection.addIceCandidate(ice);
            logger.log(`Added ICE candidate for:${this.connection.connectionId}`)
        } catch (e) {
            this.connection.provider.emitError(PeerErrorType.WebRTC, <Error>e);
            logger.log("Failed to handleCandidate,  ", e)
        }
    }
    public cleanup = () => {
        logger.log("Cleaning up PeerConnection to" + this.connection.connectionId)
        const peerConnection = this.connection.peerConnection;
        if (!peerConnection) return;
        // @ts-ignore
        this.connection.peerConnection = null
        // unsubscribe from all PeerConnection's Event
        peerConnection.onicecandidate =
            peerConnection.oniceconnectionstatechange =
                peerConnection.onicegatheringstatechange =
                    peerConnection.ontrack = () => {};
        const peerConnectionNotClosed = peerConnection.signalingState !== "closed";

        if (peerConnectionNotClosed) peerConnection.close();
    }
    private _startPeerConnection = (): RTCPeerConnection => {
        logger.log("Creating RTCPeerConnection.");

        const peerConnection = new RTCPeerConnection(
            this.connection.provider.options.config
        )

        this._listen(peerConnection);
        return peerConnection
    }
    private _listen = (peerConnection: RTCPeerConnection) => {
        const connectionId = this.connection.connectionId;
        // ICE CANDIDATES.
        logger.log("Listening for ICE candidates.");
        peerConnection.onicecandidate = this._onicecandidate
        peerConnection.oniceconnectionstatechange = () => this._onicecandidatestatechange(peerConnection)
        peerConnection.onicegatheringstatechange = () => this._onicegatheringstate(peerConnection)
        // MEDIACONNECTION.
        logger.log("Listening for remote stream");
        peerConnection.ontrack = this._ontrack
        // Renegotiation
        logger.log(`Renegotiating connection for ${connectionId}`)
        peerConnection.onnegotiationneeded = this._onnegotiationneeded
    }
    private _makeOffer = async (presentMode: boolean = false) => {
        const peerConnection = this.connection.peerConnection;
        const provider = this.connection.provider;
        const api = provider.api

        try {
            const offer = await peerConnection.createOffer(
                this.connection.options.constraints

            )

            logger.log("Offer created");

            if (
                this.connection.options.sdpTransform &&
                typeof this.connection.options.sdpTransform === "function"
            ) {
                offer.sdp = this.connection.options.sdpTransform(offer.sdp)
            }

            try {
                await peerConnection.setLocalDescription(offer);

                logger.log("LocalDescription set:", offer, `for:${this.connection.connectionId}`);

                let payload: any =  {
                    sdp_sdp: offer.sdp,
                    sdp_type: offer.type,
                    media_config: this.connection.metadata
                }

                let apiResponse: ServerMessage;
                try {
                    if (presentMode){
                        apiResponse = await api.present<ServerMessage>(payload)
                    } else {
                        apiResponse = await api.join<ServerMessage>({...payload, pin: provider.options.pin})
                    }
                    logger.log(apiResponse)
                    provider._updateConnection(this.connection.connectionId, apiResponse.payload.connectionId)
                    this.connection.handleMessage(apiResponse)
                } catch (e: any) {
                    provider.emitError(PeerErrorType.ServerError, e);
                    logger.error(e)
                }

            } catch (e) {
                provider.emitError(PeerErrorType.WebRTC, <Error>e)
                logger.log("Failed to setLocalDescription")
            }
        } catch (err_1) {
            provider.emitError(PeerErrorType.WebRTC, <Error>err_1);
            logger.log("Failed to createOffer, ", err_1)
        }
    };
    private _makeAnswer = async () => {
        const peerConnection = this.connection.peerConnection;
        const provider = this.connection.provider;

        try {
            const answer = await peerConnection.createAnswer();
            logger.log("Created answer");

            if (
                this.connection.options.sdpTransform &&
                typeof this.connection.options.sdpTransform === "function"
            ) {
                answer.sdp = this.connection.options.sdpTransform(answer.sdp) || answer.sdp;
            }

            try {
                await peerConnection.setLocalDescription(answer);
                logger.log("Set localDescription:", answer, `for: ${this.connection.connectionId}`)
                // send answer to backend
                let payload: any =  {
                    sdp_sdp: answer.sdp,
                    sdp_type: answer.type,
                    connection_id: this.connection.connectionId
                }
                try {
                    const apiResponse = await provider.api.sendAnswer(payload)
                    logger.log(apiResponse)
                } catch (e: any) {
                    logger.log(e)
                    provider.emitError(PeerErrorType.ServerError, e)
                }
            } catch (e: any) {
                provider.emitError(PeerErrorType.WebRTC, e)
            }
        } catch (e: any) {
            provider.emitError(PeerErrorType.WebRTC, e)
        }
    };
    private _onicecandidate = (evt: RTCPeerConnectionIceEvent) => {
        if (!evt.candidate || !evt.candidate.candidate) return;
        logger.log(`Recieved ICE candidates for ${this.connection.connectionId}:`, evt.candidate);
        this._icecandidates.push(evt.candidate)
    }
    private _onicecandidatestatechange = (connection: RTCPeerConnection) => {
        const peerId = this.connection.connectionId
        switch (connection.iceConnectionState) {
            case "failed":
                logger.log(
                    "iceConnectionState is failed, closing connections to " + peerId,
                );
                this.connection.emit(
                    "error",
                    new Error("Negotiation of connection to " + peerId + " failed."),
                );
                this.connection.close();
                break;
            case "closed":
                logger.log(
                    "iceConnectionState is closed, closing connections to " + peerId,
                );
                this.connection.emit(
                    "error",
                    new Error("Connection to " + peerId + " closed."),
                );
                this.connection.close();
                break;
            case "disconnected":
                logger.log(
                    "iceConnectionState changed to disconnected on the connection with " +
                    peerId,
                );
                break;
            case "completed":
                connection.onicecandidate = util.noop;
                break;
        }

        this.connection.emit(
            "iceStateChanged",
            connection.iceConnectionState,
        );
    }
    private _onicegatheringstate = (conn: RTCPeerConnection) => {
        switch (conn.iceGatheringState) {
            case "complete":
                this.connection.provider.api.trickleIce(this.connection.connectionId, this._icecandidates)
                break;
            case "gathering":
                logger.log(`Gathering ice for connection ${this.connection.connectionId}`)
                break
            default:
                break
        }
    }
    private _ontrack = (evt:RTCTrackEvent) => {
        const connectionId = this.connection.connectionId;
        const provider = this.connection.provider;
        logger.log("Received remote stream");
        const stream = evt.streams[0];
        const connection = provider.getConnection(connectionId);
        if (connection?.type === ConnectionType.Media){
            const mediaConnection = <MediaConnection>connection
            this._addStreamToMediaConnection(stream, mediaConnection)
        }
    }
    private _onnegotiationneeded = () => {}
    private _addTracksToConnection = (
        stream: LocalStream,
        peerConnection: RTCPeerConnection
    ) => {
        logger.log(`add tracks from stream ${stream.id} to peer connection`);

        if (!peerConnection.addTrack){
            return logger.log(
                `Your browser doesn't support RTCPeerconnection#addTrack. Ignored.`
            );
        }
        stream.getTracks(true).forEach((track) => {
            peerConnection.addTrack(<MediaStreamTrack>track, stream.mediaStream)
        });
    };
    private _addStreamToMediaConnection = (
        stream: MediaStream,
        mediaConnection: MediaConnection
    ) => {
        logger.log(
            `add stream ${stream.id} to media connection ${mediaConnection.connectionId}`,
        );
        mediaConnection.addStream(stream);
    };
}