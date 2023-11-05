import { BufferedConnection } from "./BufferedConnection.ts";
import { SerializationType } from "../../enums.ts";
import { util } from "../../util.ts";
export class JsonConnection extends BufferedConnection {
	readonly serialization = SerializationType.JSON;
	private readonly encoder = new TextEncoder();
	private readonly decoder = new TextDecoder();

	stringify: (data: any) => string = JSON.stringify;
	parse: (data: string) => any = JSON.parse;

	// Handles a DataChannel message.
	protected override _handleDataMessage({ data }: { data: Uint8Array }): void {
		let deserializedData = this.parse(this.decoder.decode(data));

		// PeerJS specific message
		const peerData = deserializedData["__peerData"];
		if (peerData && peerData.type === "close") {
			this.close();
			return;
		}

		this.emit("data", deserializedData);
	}

	override _send(data: any, _chunked: boolean) {
		const encodedData = this.encoder.encode(this.stringify(data));
		if (encodedData.byteLength >= util.chunkedMTU) {
			this.emit("error", new Error("Message too big for JSON channel"));
			return;
		}
		this._bufferedSend(encodedData);
	}
}
