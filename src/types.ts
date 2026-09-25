export type InputDevice = {
	/** CoreAudio device UID. Usually stable, but USB devices without a serial number get a new one on a different port. */
	uid: string;
	name: string;
	/** Input mute state; absent when the device has no mute control. */
	muted?: boolean;
};

/** One `micctl list` / `micctl watch` line. */
export type MicSnapshot = {
	/** UID of the system default input device ("" when there is none). */
	default: string;
	devices: InputDevice[];
};
