import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keyState, pressAction, wrapTitle } from "../src/key-state.ts";
import type { InputDevice, MicSnapshot } from "../src/types.ts";

const jlab: InputDevice = { uid: "usb:jlab", name: "JLab GO Talk", muted: false };
const builtIn: InputDevice = { uid: "BuiltInMicrophoneDevice", name: "MacBook Pro Microphone", muted: false };
const iphone: InputDevice = { uid: "continuity:iphone", name: "iPhone Microphone" }; // no mute control

const snapshot = (defaultUid: string, ...devices: InputDevice[]): MicSnapshot => ({ default: defaultUid, devices });

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
