import { BufferedConnection } from "./BufferedConnection.ts";
import { SerializationType } from "../../enums.ts";

export class RawConnection extends BufferedConnection {
	readonly serialization = SerializationType.None;

	protected _handleDataMessage({ data }: MessageEvent) {
		super.emit("data", data);
	}

	override _send(data: ArrayBuffer, _chunked: boolean) {
		this._bufferedSend(data);
	}
}
