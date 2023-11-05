import {LocalAudioTrack, LocalVideoTrack, LocalTrackOptions} from "twilio-video";


class RemoteAudioTrack extends LocalAudioTrack {
    constructor(mediaStreamTrack: MediaStreamTrack, options?: LocalTrackOptions) {
        super(mediaStreamTrack, options);
    }

}


class RemoteVideoTrack extends LocalVideoTrack {
    constructor(mediaStreamTrack: MediaStreamTrack, options?: LocalTrackOptions) {
        super(mediaStreamTrack, options);
    }
}

export type RemoteTrack = RemoteVideoTrack | RemoteAudioTrack

export {RemoteVideoTrack, RemoteAudioTrack}