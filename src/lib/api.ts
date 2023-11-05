
import logger from "./logger.ts";
import {PeerJSOption} from "./optionInterfaces.ts";

export class API {
    constructor(private readonly _options: PeerJSOption) {}

    get protocol(): "https" | "http" {
        return this._options.secure ? "https": "http";
    }

    get host() {
        return this._options.host
    }

    get port() {
        return this._options.port
    }

    get referrer(){
        return this._options.referrerPolicy
    }

    get baseUrl() {
        return `${this.protocol}://${this.host}:${this.port}`
    }

    private _post = async <T>(url: URL, data?: BodyInit ): Promise<T> => {
        try {
            const response = await fetch(url.href,
                {
                    referrerPolicy: this.referrer,
                    method: "POST",
                    body: JSON.stringify(data),
                    headers:{ "Content-Type": "application/json" }
                })
            if (response.status !== 200) throw new Error(`Error. Status: ${response.status}`)
            return response.json()
        } catch (err: any) {
            logger.log("Error Occurred during request", err)
            throw new Error(err.toString())
        }
    }

    public join = async <T>(data: BodyInit) => {
        const url = new URL(`${this.baseUrl}/groups/${this._options.groupId}/join/`);
        try {
            return await this._post<T>(url, data);
        } catch (error){
            throw new Error(`Could not join group: ${this._options.groupId}`);
        }
    }

    public sendAnswer = async <T>(data: BodyInit) => {
        const url = new URL(`${this.baseUrl}/participants/answer/`);
        try {
            return await this._post<T>(url, data)
        } catch (e) {
            throw new Error("Error sending answer to the server" + e)
        }
    }
    public trickleIce = async (connectionId: string, candidates: RTCIceCandidate[]) => {
        const url = new URL(`${this.baseUrl}/participants/${connectionId}/trickle/`)
        try {
            return await this._post(url, <BodyInit><unknown>candidates)
        } catch (e: any) {
            throw new Error(e.toString());
        }
    }

    public present = async <T>(data: BodyInit) => {
        const url = new URL(`${this.baseUrl}/participants/present/`)
        try {
            return await this._post<T>(url, data)
        } catch (e: any) {
            throw new Error(e)
        }
    }
}