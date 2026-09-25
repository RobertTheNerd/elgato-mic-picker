import { execFile, spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { createInterface } from "node:readline";
import streamDeck from "@elgato/streamdeck";

import type { InputDevice, MicSnapshot } from "./types.ts";

const MICCTL = path.join(process.cwd(), "bin", "micctl");

/**
 * Keeps an up-to-date view of the system's input devices by running `micctl watch`,
 * which pushes a new JSON snapshot whenever CoreAudio reports a change.
 */
class MicMonitor extends EventEmitter<{ change: [MicSnapshot] }> {
	snapshot: MicSnapshot = { default: "", devices: [] };
	#child?: ChildProcess;

	start(): void {
		if (this.#child) return;
		const child = spawn(MICCTL, ["watch"], { stdio: ["pipe", "pipe", "inherit"] });
		this.#child = child;
		createInterface({ input: child.stdout! }).on("line", (line) => {
			try {
				this.snapshot = JSON.parse(line) as MicSnapshot;
				this.emit("change", this.snapshot);
			} catch (err) {
				streamDeck.logger.warn(`micctl: bad line ${line}`, err);
			}
		});
		child.on("exit", (code) => {
			streamDeck.logger.warn(`micctl watch exited (${code}); restarting`);
			this.#child = undefined;
			setTimeout(() => this.start(), 1000);
		});
	}

	setDefault(uid: string): Promise<void> {
		return run("set", uid);
	}

	toggleMute(uid: string): Promise<void> {
		return run("mute", uid, "toggle");
	}
}

function run(...args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(MICCTL, args, (err, _out, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()));
	});
}

export const mics = new MicMonitor();
