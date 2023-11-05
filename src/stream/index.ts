import {LocalAudioTrack, LocalVideoTrack, VideoTrack,
    AudioTrack} from "twilio-video";
import {RemoteVideoTrack, RemoteAudioTrack} from "./remotetrack.ts";

abstract class Stream {
    private readonly _mediaStream = new MediaStream();
    protected constructor(readonly _tracks: (VideoTrack | AudioTrack)[]) {
        this._construct()
    }
    public getTracks = (deepMap: boolean = true) => this._tracks
        .map(t => deepMap ? t.mediaStreamTrack : t);
    get mediaStream(){
        return this._mediaStream
    };
    get hasAudioTracks(){
        return this.getAudioTracks(false).length > 0
    };
    get hasVideoTracks() {
        return this.getVideoTracks(false).length > 0
    };

    public getVideoTracks = (deepFilter = true) => {
        const videoTracks = this._tracks.filter(t => t.kind === "video");
        if (deepFilter) return videoTracks.map(v => v.mediaStreamTrack);
        return videoTracks;
    };
    public getAudioTracks = (deepFilter = true) => {
        const audioTracks = this._tracks.filter(t => t.kind === "audio");
        if (deepFilter) return audioTracks.map(a => a.mediaStreamTrack)
        return audioTracks;
    };
    get id(){
        return this.mediaStream.id;
    };

    private _construct = () => {
        this.getTracks().forEach(m => this._mediaStream.addTrack(<MediaStreamTrack>m))
    };
}

class LocalStream extends Stream{
    constructor(readonly _tracks: (LocalVideoTrack | LocalAudioTrack)[]) {
        super(_tracks)
    }

}

class RemoteStream extends Stream {
    constructor(readonly _tracks: (RemoteVideoTrack | RemoteAudioTrack)[]) {
        super(_tracks);
    }
}

export {LocalStream, RemoteStream};