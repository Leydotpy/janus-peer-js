import { util } from "./util.ts";
import { Peer } from "./peer.ts";

(<any>window).peerjs = {
	Peer,
	util,
};
/** @deprecated Should use peerjs namespace */
(<any>window).Peer = Peer;
