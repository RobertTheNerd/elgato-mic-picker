import { EventEmitter } from "node:events";
import streamDeck from "@elgato/streamdeck";
import { preferredToRestore, resolveDevice, type PreferredTrigger } from "./key-state.ts";
import { mics } from "./mic-monitor.ts";

export type Preferred = { uid: string; name?: string };
type GlobalSettings = { preferred?: Preferred };

/** Give the audio system a moment after wake before checking; devices often reappear or settle right then. */
const WAKE_SETTLE_MS = 2000;

/**
 * The one mic (if any) the user asked to prefer. It's stored in the plugin's global settings, so it doesn't depend on
 * which profile or page is showing. It becomes the default input whenever `preferredToRestore` says so.
 */
class PreferredMic extends EventEmitter<{ change: [] }> {
	#preferred?: Preferred;
	/** False until global settings have loaded; until then `current` means "unknown", not "none". */
	loaded = false;

	get current(): Preferred | undefined {
		return this.#preferred;
	}

	/** Whether `uid` is the preferred mic, including when the mic came back under a new UID. */
	is(uid: string | undefined): boolean {
		if (!uid || !this.#preferred) return false;
		return uid === this.#preferred.uid || resolveDevice(this.#preferred, mics.snapshot)?.uid === uid;
	}

	async start(): Promise<void> {
		this.#preferred = (await streamDeck.settings.getGlobalSettings<GlobalSettings>()).preferred;
		this.loaded = true;
		streamDeck.logger.info(`Preferred mic: ${this.#preferred?.name ?? "none"}`);
		this.emit("change");
		mics.on("change", (snapshot, previous) => void this.#check({ kind: "snapshot", previous }));
		mics.on("wake", () => setTimeout(() => void this.#check({ kind: "wake" }), WAKE_SETTLE_MS));
		// Settings load after micctl's first snapshot may have arrived, so treat that as the startup check.
		if (mics.ready) await this.#check({ kind: "snapshot", previous: undefined });
	}

	async set(preferred: Preferred | undefined): Promise<void> {
		if (preferred?.uid === this.#preferred?.uid && preferred?.name === this.#preferred?.name) return;
		this.#preferred = preferred;
		await streamDeck.settings.setGlobalSettings<GlobalSettings>(preferred ? { preferred } : {});
		streamDeck.logger.info(`Preferred mic set to ${preferred?.name ?? "none"}`);
		this.emit("change");
	}

	async #check(trigger: PreferredTrigger): Promise<void> {
		const device = preferredToRestore(this.#preferred, mics.snapshot, trigger);
		if (device) {
			streamDeck.logger.info(`Making preferred mic ${device.name} the default (${trigger.kind})`);
			try {
				await mics.setDefault(device.uid);
			} catch (err) {
				streamDeck.logger.error(`Failed to make preferred mic ${device.name} the default`, err);
			}
		}
		// Follow the mic if it came back under a new UID (see resolveDevice).
		const current = this.#preferred && resolveDevice(this.#preferred, mics.snapshot);
		if (current && current.uid !== this.#preferred?.uid) await this.set({ uid: current.uid, name: current.name });
	}
}

export const preferredMic = new PreferredMic();
