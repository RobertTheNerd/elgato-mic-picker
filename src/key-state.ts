import type { InputDevice, MicSnapshot } from "./types.ts";

/** What a key should look like. */
export type KeyState =
	/** Not configured, or the device is unplugged. */
	| "missing"
	/** Connected, but not the system default input. */
	| "inactive"
	/** The default input, live. */
	| "active"
	/** The default input, muted. */
	| "muted";

/** What pressing a key should do. */
export type PressAction = "alert" | "make-default" | "toggle-mute";

export function keyState(device: InputDevice | undefined, snapshot: MicSnapshot): KeyState {
	if (!device) return "missing";
	if (device.uid !== snapshot.default) return "inactive";
	return device.muted ? "muted" : "active";
}

/** First press makes the mic the default input; once it is, presses toggle its mute. */
export function pressAction(device: InputDevice | undefined, snapshot: MicSnapshot): PressAction {
	if (!device) return "alert";
	if (device.uid !== snapshot.default) return "make-default";
	return device.muted === undefined ? "alert" : "toggle-mute"; // no mute control → alert
}

/** Key titles don't wrap on their own; break long device names onto up to three short lines. */
export function wrapTitle(text: string, width = 10): string {
	const lines: string[] = [];
	for (const word of text.trim().split(/\s+/)) {
		const last = lines.at(-1);
		if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
		else lines.push(word);
	}
	return lines.slice(0, 3).join("\n");
}
