import logger from "../../lib/logger.ts";

export default class SoundMeter {
    private _instant: number = 0.0;
    private _slow: number = 0.0;
    private readonly _script: ScriptProcessorNode;
    private _mic?: MediaStreamAudioSourceNode;
    // @ts-ignore
    private _clip: number = 0.0;
    constructor(readonly context: AudioContext) {
        this._script = this.context.createScriptProcessor(2058,1, 1);
        this._script.onaudioprocess = this._onaudioprocess;
    }
    private _onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        let j;
        let sum = 0.0;
        let clipcount = 0;
        for (j = 0; j < input.length; j++) {
            sum += input[j] * input[j];
            if (Math.abs(input[j]) > 0.99) {
                clipcount += 1;
            }
        }
        this._instant = Math.sqrt(sum / input.length);
        this._slow = 0.95 * this._slow + 0.05 * this._instant;
        this._clip = clipcount / input.length;
    }
    public connectToSource = (stream: MediaStream, callback?: VoidFunction) => {
        logger.log('SoundMeter connecting...');
        try {
            this._mic = this.context.createMediaStreamSource(stream);
            this._mic.connect(this._script);
            this._script.connect(this.context.destination);
            if (typeof callback !== "undefined") {
                callback();
            }
        } catch (e) {
            logger.error(e)
            if (typeof callback !== "undefined"){
                callback();
            }
        }
    }
    public stop = () => {
        logger.log('SoundMeter stopping!');
        this._mic?.disconnect();
        this._script.disconnect();
    }
}