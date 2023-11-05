export interface AnswerOption {
	/**
	 * Function which runs before create answer to modify sdp answer message.
	 */
	sdpTransform?: Function;
}

export interface PeerJSOption {
	pin?: string;
	groupId?: string;
	key?: string;
	host?: string;
	port?: number;
	path?: string;
	secure?: boolean;
	token?: string;
	config?: RTCConfiguration;
	debug?: number;
	referrerPolicy?: ReferrerPolicy;
}

export interface PeerConnectOption {
	/**
	 * A unique label by which you want to identify this data connection.
	 * If left unspecified, a label will be generated at random.
	 *
	 * Can be accessed with {@apilink DataConnection.label}
	 */
	label?: string;
	/**
	 * Metadata associated with the connection, passed in by whoever initiated the connection.
	 *
	 * Can be accessed with {@apilink DataConnection.metadata}.
	 * Can be any serializable type.
	 */
	metadata?: Metadata;
	serialization?: string;
	reliable?: boolean;
}

export interface CallOption {
	/**
	 * Metadata associated with the connection, passed in by whoever initiated the connection.
	 *
	 * Can be accessed with {@apilink MediaConnection.metadata}.
	 * Can be any serializable type.
	 */
	metadata?: Metadata;
	/**
	 * Function which runs before create offer to modify sdp offer message.
	 */
	sdpTransform?: Function;
	/**
	 * Designates the source of the published media stream
	 */
	src?: "screen" | "media";
}

export interface Metadata {
	bitrate?: string;
	audiocodec?: string;
	videocodec?: string;
	opus_fec?: boolean;
	opus_dtx?: boolean;
	audiolevel_event?: boolean;
}

export interface ServerPayload {
	type: string;
	connectionId: string;
	sdp: any;
	data: any;
}

export interface User {
	username: string;
	email: string;
	full_name: string;
	image: string;
	first_name: string;
	last_name: string;
}

export interface Participant {
	id: string;
	user: User;
	co_host: boolean;
	participant_id: string;
}
