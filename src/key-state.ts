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

/**
 * Finds the configured device in the snapshot: by UID, then by UID ignoring the USB port, then by name.
 *
 * The fallbacks matter for USB audio devices without a serial number. macOS builds their UID from the USB port
 * location (e.g. `AppleUSBAudioEngine:C-Media Electronics Inc.:JLab GO Talk:22200000:2`), so the UID changes when
 * the device, or the hub it's on, is plugged into a different port. Each fallback only applies when exactly one
 * connected device matches, so two identical mics are never mixed up.
 */
export function resolveDevice(saved: { uid?: string; name?: string }, snapshot: MicSnapshot): InputDevice | undefined {
	if (!saved.uid) return undefined;
	const byUid = snapshot.devices.find((d) => d.uid === saved.uid);
	if (byUid) return byUid;
	const portless = withoutUsbPort(saved.uid);
	return (
		only(snapshot.devices.filter((d) => portless !== undefined && withoutUsbPort(d.uid) === portless)) ??
		only(snapshot.devices.filter((d) => saved.name !== undefined && d.name === saved.name))
	);
}

/** `AppleUSBAudioEngine:<vendor>:<product>:<port location>:<interface>` without the port location. */
export function withoutUsbPort(uid: string): string | undefined {
	const parts = uid.split(":");
	if (parts[0] !== "AppleUSBAudioEngine" || parts.length < 5) return undefined;
	parts.splice(-2, 1);
	return parts.join(":");
}

function only<T>(items: T[]): T | undefined {
	return items.length === 1 ? items[0] : undefined;
}

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

/** Why the preferred mic might need to become the default input again. */
export type PreferredTrigger =
	/** A new device snapshot arrived; `previous` is undefined for the first one after the plugin starts. */
	| { kind: "snapshot"; previous: MicSnapshot | undefined }
	/** The Mac woke from sleep. */
	| { kind: "wake" };

/**
 * Returns the preferred mic if it should be made the default input now, otherwise undefined.
 *
 * The preferred mic takes over when the plugin starts, when the mic (re)connects, and when the Mac wakes, but only
 * if it isn't already the default. It doesn't take over on other changes, so switching to another mic by hand sticks.
 */
export function preferredToRestore(
	preferred: { uid?: string; name?: string } | undefined,
	snapshot: MicSnapshot,
	trigger: PreferredTrigger,
): InputDevice | undefined {
	if (!preferred) return undefined;
	const device = resolveDevice(preferred, snapshot);
	if (!device || device.uid === snapshot.default) return undefined;
	if (trigger.kind === "wake" || !trigger.previous) return device;
	return resolveDevice(preferred, trigger.previous) ? undefined : device; // only when it just connected
}
