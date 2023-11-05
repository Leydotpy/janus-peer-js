import Video, {CreateLocalTrackOptions, LocalAudioTrack,
    LocalVideoTrack} from "twilio-video";
import {LocalStream, RemoteStream} from "../stream";
import { RemoteAudioTrack, RemoteVideoTrack } from "../stream/remotetrack.ts";

async function getLocalVideoTrack(selectedVideoDeviceId?: string) {

    const { videoInputDevices } = await getDeviceInfo();

    const hasSelectedVideoDevice = videoInputDevices.some(
        device => selectedVideoDeviceId && device.deviceId === selectedVideoDeviceId
    );

    const options: CreateLocalTrackOptions = {
        name: `camera-${Date.now()}`,
        ...(hasSelectedVideoDevice && { deviceId: { exact: selectedVideoDeviceId! } }),
    };

    return Video.createLocalVideoTrack(options)
}

async function createLocalStream(selectedAudioDeviceId?: string, selectedVideoDeviceId?: string, options?: any,  cb?: VoidFunction) {

    options = {...options}

    const { audioInputDevices, videoInputDevices, hasAudioInputDevices, hasVideoInputDevices } = await getDeviceInfo();

    if (!hasAudioInputDevices && !hasVideoInputDevices) return Promise.resolve();

    const hasSelectedAudioDevice = audioInputDevices.some(
        device => selectedAudioDeviceId && device.deviceId === selectedAudioDeviceId
    );
    const hasSelectedVideoDevice = videoInputDevices.some(
        device => selectedVideoDeviceId && device.deviceId === selectedVideoDeviceId
    );

    // In Chrome, it is possible to deny permissions to only audio or only video.
    // If that has happened, then we don't want to attempt to acquire the device.
    const isCameraPermissionDenied = await isPermissionDenied('camera');
    const isMicrophonePermissionDenied = await isPermissionDenied('microphone');

    const shouldAcquireVideo = hasVideoInputDevices && !isCameraPermissionDenied;
    const shouldAcquireAudio = hasAudioInputDevices && !isMicrophonePermissionDenied;

    const localTrackConstraints = {
        video: shouldAcquireVideo && {
            name: `camera-${Date.now()}`,
            ...options.video,
            ...(hasSelectedVideoDevice && { deviceId: { exact: selectedVideoDeviceId! } }),
        },
        audio: shouldAcquireAudio && {
            ...options.audio,
            ...(hasSelectedAudioDevice && { deviceId: { exact: selectedAudioDeviceId! } }),
        },
    };

    // These custom errors will be picked up by the MediaErrorSnackbar component.
    if (isCameraPermissionDenied && isMicrophonePermissionDenied) {
        const error = new Error();
        error.name = 'NotAllowedError';
        throw error;
    }

    if (isCameraPermissionDenied) {
        throw new Error('CameraPermissionsDenied');
    }

    if (isMicrophonePermissionDenied) {
        throw new Error('MicrophonePermissionsDenied');
    }

    const tracks = await Video.createLocalTracks(localTrackConstraints)
    const newVideoTrack = tracks.find(track => track.kind === 'video') as LocalVideoTrack;
    const newAudioTrack = tracks.find(track => track.kind === 'audio') as LocalAudioTrack;
    const localTracks = [newAudioTrack, newVideoTrack].filter(track => track !== undefined) as (
        | LocalAudioTrack
        | LocalVideoTrack
        )[];

    if (cb){
        cb()
    }

    return new LocalStream(localTracks)
}

async function createRemoteStream(stream: MediaStream) {
    const mediaStreamTracks = [
        ...stream.getAudioTracks(),
        ...stream.getVideoTracks()
    ];
    const tracks =  await Promise.all(
        mediaStreamTracks.map(async mediaStreamTrack => {
            switch (mediaStreamTrack.kind) {
                case "audio":
                    return new RemoteAudioTrack(mediaStreamTrack, {
                        name: mediaStreamTrack.label,
                    })
                case "video":
                    return new RemoteVideoTrack(mediaStreamTrack, {
                        name: mediaStreamTrack.label
                    })
            }
        })
    );

    const newRemoteTracks = tracks
        .filter(track => track !== undefined) as (
            RemoteVideoTrack | RemoteAudioTrack
        )[];

    return new RemoteStream(newRemoteTracks);
}

async function getDeviceInfo() {
    const devices = await navigator.mediaDevices.enumerateDevices();

    return {
        audioInputDevices: devices.filter(device => device.kind === 'audioinput'),
        videoInputDevices: devices.filter(device => device.kind === 'videoinput'),
        audioOutputDevices: devices.filter(device => device.kind === 'audiooutput'),
        hasAudioInputDevices: devices.some(device => device.kind === 'audioinput'),
        hasVideoInputDevices: devices.some(device => device.kind === 'videoinput'),
    };
}

async function isPermissionDenied(name: 'camera' | 'microphone') {
    const permissionName = name as PermissionName; // workaround for https://github.com/microsoft/TypeScript/issues/33923

    if (navigator.permissions) {
        try {
            const result = await navigator.permissions.query({ name: permissionName });
            return result.state === 'denied';
        } catch {
            return false;
        }
    } else {
        return false;
    }
}

const qvgaConstraints = {
    video: {width: {exact: 320}, height: {exact: 240}},
};

const vgaConstraints = {
    video: {width: {exact: 640}, height: {exact: 480}}
};

const hdConstraints = {
    video: {width: {exact: 1280}, height: {exact: 720}}
};

const fullHdConstraints = {
    video: {width: {exact: 1920}, height: {exact: 1080}}
};

const televisionFourKConstraints = {
    video: {width: {exact: 3840}, height: {exact: 2160}}
};

const cinemaFourKConstraints = {
    video: {width: {exact: 4096}, height: {exact: 2160}}
};

const eightKConstraints = {
    video: {width: {exact: 7680}, height: {exact: 4320}}
};

export {
    getLocalVideoTrack,
    createLocalStream,
    createRemoteStream,
    getDeviceInfo,
    isPermissionDenied,
    qvgaConstraints,
    hdConstraints,
    fullHdConstraints,
    televisionFourKConstraints,
    cinemaFourKConstraints,
    eightKConstraints,
    vgaConstraints
}