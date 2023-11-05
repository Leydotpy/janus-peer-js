import * as PIXI from 'pixi.js'
import {Application, Graphics, ICanvas} from 'pixi.js'

export default class Visualizer {
    private MARGIN: number = 8
    private trippyMode: boolean = false
    private rad15deg = Math.PI / 12
    private smallerSide?: number = undefined
    private _app: Application<ICanvas>;
    private _gainNode: GainNode | undefined
    private highfilter?: BiquadFilterNode;
    private lowfilter?: BiquadFilterNode;
    private lowAnalyzer?: AnalyserNode
    private highAnalyzer?: AnalyserNode
    private audioSourceNode: MediaStreamAudioSourceNode | undefined;
    private readonly graphics: Graphics;

    constructor(canvas: HTMLCanvasElement) {
        PIXI.Graphics.curves.adaptive = true
        PIXI.Graphics.curves.maxLength = 5
        this._app = new PIXI.Application({
            view: canvas,
            antialias: true,
            resolution: window.devicePixelRatio,
            background: 0x0f0f0f,
            autoDensity: true
        })

        this._app.ticker.speed = 2

        window.addEventListener('resize', this.resize, false)
        this.resize()

        this.graphics = new PIXI.Graphics()
        this._app.stage.addChild(this.graphics)

        // this._mediaInput = stream
    }

    private _context: AudioContext | undefined

    get context(): AudioContext | undefined {
        return this._context
    }

    get gainNode(): GainNode | undefined {
        return this._gainNode
    }
    public resize = () => {
        this._app.renderer.resize(window.innerWidth, window.innerHeight)
        this.smallerSide = Math.min(window.innerWidth, window.innerHeight)
    }

    toggleTippyMode = () => {
        this.initAudioContext()

        this.trippyMode = !this.trippyMode
        if (this.trippyMode) {
            if (this.lowAnalyzer) this.lowAnalyzer.smoothingTimeConstant = 0.8
            if (this.highAnalyzer) this.highAnalyzer.smoothingTimeConstant = 0.88
        } else {
            if (this.lowAnalyzer) this.lowAnalyzer.smoothingTimeConstant = 0.89
            if (this.highAnalyzer) this.highAnalyzer.smoothingTimeConstant = 0.87
        }
    }

    public start = (input: MediaStream, cb?: VoidFunction) => {
        this.initAudioContext()
        if (this.audioSourceNode === undefined) {
            this.audioSourceNode = this._context?.createMediaStreamSource(input)
        }
        if (this._context?.state === "suspended") {
            this._context.resume()
                .then(this._connectSourceNodes)
                .catch(err => console.log(err.message))
                .finally(cb)
        } else this._connectSourceNodes()
    }

    public stop = (cb?: VoidFunction) => {
        this._disconnectAudioNode()
            .then(cb)
            .catch(err => console.log(err))

    }

    public setVolume = (volume: number) => {
        if (
            this.gainNode &&
            this.context &&
            this.audioSourceNode
        ){
            this.gainNode.gain.value = volume
            this._disconnectAudioNode()
                .then(this._connectSourceNodes)
        } else return
    }

    private _connectSourceNodes = () => {
        if (
            this.context &&
            this.gainNode &&
            this.lowfilter &&
            this.highfilter &&
            this.audioSourceNode
        ) {
            console.log("connecting...")
            this.audioSourceNode.connect(this.gainNode)
                .connect(this.highfilter)
                .connect(this.lowfilter)
            this.gainNode.connect(this.context.destination)
        } else return
    }

    private _disconnectAudioNode = async () => {
        if (this.audioSourceNode) this.audioSourceNode.disconnect()
        else return
    }

    private initAudioContext() {
        if (this._context) return

        this._context = new AudioContext()
        this._gainNode = this._context.createGain()
        this.lowAnalyzer = this._context.createAnalyser()
        this.lowAnalyzer.minDecibels = -80
        this.lowAnalyzer.maxDecibels = -20
        this.lowAnalyzer.fftSize = 32
        this.lowAnalyzer.smoothingTimeConstant = 0.89
        const lowFrequencyData = new Uint8Array(this.lowAnalyzer.frequencyBinCount)

        this.highAnalyzer = this._context.createAnalyser()
        this.highAnalyzer.minDecibels = -80
        this.highAnalyzer.maxDecibels = -20
        this.highAnalyzer.fftSize = 32
        this.highAnalyzer.smoothingTimeConstant = 0.87
        const highFrequencyData = new Uint8Array(this.lowAnalyzer.frequencyBinCount)

        this.lowfilter = this._context.createBiquadFilter()
        this.lowfilter.type = 'lowpass'
        this.lowfilter.frequency.setValueAtTime(200, 0)

        this.highfilter = this._context.createBiquadFilter()
        this.highfilter.type = 'highpass'
        this.highfilter.frequency.setValueAtTime(200, 0)

        this.lowfilter.connect(this.lowAnalyzer)
        this.highfilter.connect(this.highAnalyzer)

        this._app.ticker.add(() => {
            this.graphics.clear()
            this.drawGraphic(lowFrequencyData, highFrequencyData)
        })
    }

    private drawArcV1(r: number, a: number, b: number) {
        const v = 0.75 - r / (this.smallerSide! / 2 - this.MARGIN)
        const A = this.rad15deg * a + v
        const B = this.rad15deg * b - v
        if (B > A) {
            this.drawArc(r, A, B)
        }
    }

    private drawArcV2(i: number, r: number, a: number, b: number) {
        this.drawArc(r, this.rad15deg * (a + i), this.rad15deg * (b + i), true)
    }

    private drawArc(radius: number, startAngle: number, endAngle: number, spikes = false) {
        const X = window.innerWidth / 2
        const Y = window.innerHeight / 2
        const startX = X + Math.cos(startAngle) * (radius - this.MARGIN)
        const startY = Y + Math.sin(startAngle) * (radius - this.MARGIN)
        this.graphics.moveTo(startX, startY)
        this.graphics.arc(X, Y, radius - this.MARGIN - (spikes ? 4 : 0), startAngle, endAngle)
    }

    private drawGraphic = (lowFrequencyData: Uint8Array, highFrequencyData: Uint8Array) => {
        this.lowAnalyzer?.getByteFrequencyData(lowFrequencyData)
        this.highAnalyzer?.getByteFrequencyData(highFrequencyData)

        this.graphics.lineStyle(1.5, 0x009688)
        for (let i = 0; i < lowFrequencyData.length; i++) {
            if (lowFrequencyData[i] !== 0) {
                const R = (lowFrequencyData[i] * this.smallerSide!) / 512
                if (this.trippyMode) this.graphics.lineStyle(1.5, 0xffffff * Math.random())
                this.drawArcV1(R, 1, 5)
                this.drawArcV1(R, 7, 11)
                this.drawArcV1(R, 13, 17)
                this.drawArcV1(R, 19, 23)
            }
        }

        this.graphics.lineStyle(1.5, 0xff9800)
        for (let i = 0; i < highFrequencyData.length; i++) {
            if (highFrequencyData[i] !== 0) {
                const R = (highFrequencyData[i] * this.smallerSide!) / 1024
                if (this.trippyMode) this.graphics.lineStyle(1.5, 0xffffff * Math.random())
                this.drawArcV2(i, R, 1, 5)
                this.drawArcV2(i, R, 7, 11)
                this.drawArcV2(i, R, 13, 17)
                this.drawArcV2(i, R, 19, 23)
            }
        }
    }
}