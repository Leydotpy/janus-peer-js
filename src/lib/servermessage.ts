import {ServerMessageType} from "./enums.ts";
import {ServerPayload} from "./optionInterfaces.ts";

export class ServerMessage {
    // @ts-ignore
    type: ServerMessageType;
    // @ts-ignore
    payload: ServerPayload;
    // @ts-ignore
    src: string;
}
