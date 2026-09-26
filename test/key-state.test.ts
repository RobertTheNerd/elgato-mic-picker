import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keyState, preferredToRestore, pressAction, resolveDevice, wrapTitle } from "../src/key-state.ts";
import type { InputDevice, MicSnapshot } from "../src/types.ts";

const jlab: InputDevice = { uid: "usb:jlab", name: "JLab GO Talk", muted: false };
const builtIn: InputDevice = { uid: "BuiltInMicrophoneDevice", name: "MacBook Pro Microphone", muted: false };
const iphone: InputDevice = { uid: "continuity:iphone", name: "iPhone Microphone" }; // no mute control

const snapshot = (defaultUid: string, ...devices: InputDevice[]): MicSnapshot => ({ default: defaultUid, devices });

describe("resolveDevice", () => {
	// Real UIDs: the location ID segment changed after re-plugging the USB hub.
	const before = "AppleUSBAudioEngine:C-Media Electronics Inc.:JLab GO Talk:22200000:2";
	const after = "AppleUSBAudioEngine:C-Media Electronics Inc.:JLab GO Talk:21200000:2";
	const replugged: InputDevice = { uid: after, name: "JLab GO Talk", muted: false };

	it("finds the device by UID", () => {
		assert.equal(resolveDevice({ uid: jlab.uid, name: "old name" }, snapshot(jlab.uid, jlab, builtIn)), jlab);
	});

	it("falls back to the name when the UID changed (USB device moved to another port)", () => {
		assert.equal(resolveDevice({ uid: before, name: "JLab GO Talk" }, snapshot(after, replugged, builtIn)), replugged);
	});

	it("doesn't guess when two connected devices share the name", () => {
		const twin: InputDevice = {
			...replugged,
			uid: "AppleUSBAudioEngine:C-Media Electronics Inc.:JLab GO Talk:21300000:2",
		};
		assert.equal(resolveDevice({ uid: before, name: "JLab GO Talk" }, snapshot(after, replugged, twin)), undefined);
	});

	it("is undefined when neither UID nor name matches", () => {
		assert.equal(resolveDevice({ uid: before, name: "JLab GO Talk" }, snapshot(builtIn.uid, builtIn)), undefined);
	});

	it("is undefined when no device is configured", () => {
		assert.equal(resolveDevice({}, snapshot(jlab.uid, jlab)), undefined);
		assert.equal(
			resolveDevice({ name: "JLab GO Talk" }, snapshot(jlab.uid, { ...jlab, name: "JLab GO Talk" })),
			undefined,
		);
	});
});

describe("keyState", () => {
	it("is missing when the device isn't connected or configured", () => {
		assert.equal(keyState(undefined, snapshot(jlab.uid, jlab)), "missing");
	});

	it("is inactive when another device is the default input", () => {
		assert.equal(keyState(builtIn, snapshot(jlab.uid, jlab, builtIn)), "inactive");
	});

	it("is inactive even when a non-default device is muted", () => {
		const muted = { ...builtIn, muted: true };
		assert.equal(keyState(muted, snapshot(jlab.uid, jlab, muted)), "inactive");
	});

	it("is active when the device is the live default input", () => {
		assert.equal(keyState(jlab, snapshot(jlab.uid, jlab)), "active");
	});

	it("is muted when the default input is muted", () => {
		const muted = { ...jlab, muted: true };
		assert.equal(keyState(muted, snapshot(jlab.uid, muted)), "muted");
	});

	it("treats a default device without a mute control as active", () => {
		assert.equal(keyState(iphone, snapshot(iphone.uid, iphone)), "active");
	});
});

describe("pressAction", () => {
	it("alerts when the device is missing", () => {
		assert.equal(pressAction(undefined, snapshot(jlab.uid, jlab)), "alert");
	});

	it("makes a non-default device the default", () => {
		assert.equal(pressAction(builtIn, snapshot(jlab.uid, jlab, builtIn)), "make-default");
	});

	it("makes a device without mute control the default", () => {
		assert.equal(pressAction(iphone, snapshot(jlab.uid, jlab, iphone)), "make-default");
	});

	it("toggles mute when the device is already the default", () => {
		assert.equal(pressAction(jlab, snapshot(jlab.uid, jlab)), "toggle-mute");
		assert.equal(pressAction({ ...jlab, muted: true }, snapshot(jlab.uid, jlab)), "toggle-mute");
	});

	it("alerts when the default device has no mute control", () => {
		assert.equal(pressAction(iphone, snapshot(iphone.uid, iphone)), "alert");
	});
});

describe("wrapTitle", () => {
	it("leaves short names alone", () => {
		assert.equal(wrapTitle("JLab"), "JLab");
	});

	it("packs words onto lines of at most 10 characters", () => {
		assert.equal(wrapTitle("MacBook Pro Microphone"), "MacBook\nPro\nMicrophone");
		assert.equal(wrapTitle("JLab GO Talk"), "JLab GO\nTalk");
	});

	it("keeps at most three lines", () => {
		assert.equal(wrapTitle("CalDigit Thunderbolt 3 Audio Extra"), "CalDigit\nThunderbolt\n3 Audio");
	});

	it("never splits a single long word", () => {
		assert.equal(wrapTitle("Thunderbolt"), "Thunderbolt");
	});

	it("ignores surrounding and repeated whitespace", () => {
		assert.equal(wrapTitle("  JLab   GO  "), "JLab GO");
	});
});

describe("preferredToRestore", () => {
	const preferred = { uid: jlab.uid, name: jlab.name };
	const withJlab = snapshot(builtIn.uid, builtIn, jlab); // JLab connected, but the MacBook mic is the default
	const withoutJlab = snapshot(builtIn.uid, builtIn);
	const wake = { kind: "wake" } as const;
	const after = (previous: MicSnapshot) => ({ kind: "snapshot", previous }) as const;

	it("does nothing when no mic is preferred", () => {
		assert.equal(preferredToRestore(undefined, withJlab, wake), undefined);
	});

	it("takes over when the plugin starts", () => {
		assert.equal(preferredToRestore(preferred, withJlab, { kind: "snapshot", previous: undefined }), jlab);
	});

	it("takes over when the preferred mic connects", () => {
		assert.equal(preferredToRestore(preferred, withJlab, after(withoutJlab)), jlab);
	});

	it("takes over when the Mac wakes", () => {
		assert.equal(preferredToRestore(preferred, withJlab, wake), jlab);
	});

	it("lets a manual switch stick while the preferred mic stays connected", () => {
		const jlabDefault = snapshot(jlab.uid, builtIn, jlab);
		assert.equal(preferredToRestore(preferred, withJlab, after(jlabDefault)), undefined);
	});

	it("does nothing when the preferred mic is already the default", () => {
		const jlabDefault = snapshot(jlab.uid, builtIn, jlab);
		assert.equal(preferredToRestore(preferred, jlabDefault, wake), undefined);
		assert.equal(preferredToRestore(preferred, jlabDefault, after(withoutJlab)), undefined);
	});

	it("does nothing when the preferred mic isn't connected", () => {
		assert.equal(preferredToRestore(preferred, withoutJlab, wake), undefined);
	});

	it("finds the preferred mic after it moved to another USB port", () => {
		const moved: InputDevice = { ...jlab, uid: "usb:jlab-on-another-port" };
		assert.equal(preferredToRestore(preferred, snapshot(builtIn.uid, builtIn, moved), after(withoutJlab)), moved);
	});

	it("does nothing after a port change when macOS already picked the mic", () => {
		const moved: InputDevice = { ...jlab, uid: "usb:jlab-on-another-port" };
		const movedWhileDefault = snapshot(moved.uid, builtIn, moved);
		assert.equal(preferredToRestore(preferred, movedWhileDefault, after(withJlab)), undefined);
	});
});
