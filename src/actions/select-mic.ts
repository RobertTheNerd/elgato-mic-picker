import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { KEY_IMAGES } from "../icons.ts";
import { keyState, pressAction, resolveDevice, wrapTitle } from "../key-state.ts";
import { mics } from "../mic-monitor.ts";

type Settings = {
	/** CoreAudio device UID of the configured microphone (updated if the device reappears under a new UID). */
	uid?: string;
	/** Last known device name, so the key still has a label while the device is unplugged. */
	name?: string;
	/** Don't show the device name as the key title. */
	hideName?: boolean;
};

@action({ UUID: "com.robert.mic-picker.select" })
export class SelectMic extends SingletonAction<Settings> {
	constructor() {
		super();
		mics.on("change", () => {
			for (const a of this.actions) if (a.isKey()) void this.#render(a);
			void this.#sendDeviceList();
		});
	}

	override onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> | void {
		if (ev.action.isKey()) return this.#render(ev.action, ev.payload.settings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> | void {
		if (ev.action.isKey()) return this.#render(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const device = resolveDevice(ev.payload.settings, mics.snapshot);
		const todo = pressAction(device, mics.snapshot);
		streamDeck.logger.info(`Key pressed: ${device?.name ?? ev.payload.settings.uid ?? "(unconfigured)"} → ${todo}`);
		if (!device || todo === "alert") return ev.action.showAlert();
		try {
			await (todo === "toggle-mute" ? mics.toggleMute(device.uid) : mics.setDefault(device.uid));
		} catch (err) {
			streamDeck.logger.error(`Failed to ${todo}`, err);
			await ev.action.showAlert();
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getDevices") await this.#sendDeviceList();
	}

	/** Responds to the property inspector's `<sdpi-select datasource="getDevices">`. */
	#sendDeviceList(): Promise<void> {
		return streamDeck.ui.sendToPropertyInspector({
			event: "getDevices",
			items: mics.snapshot.devices.map((d) => ({ label: d.name, value: d.uid })),
		});
	}

	async #render(a: KeyAction<Settings>, settings?: Settings): Promise<void> {
		settings ??= await a.getSettings();
		const device = resolveDevice(settings, mics.snapshot);

		// Keep the saved UID and name current: the name so it can be shown while the device is unplugged, the UID
		// because USB devices get a new one when they're plugged into a different port (see resolveDevice).
		if (device && (device.uid !== settings.uid || device.name !== settings.name)) {
			if (device.uid !== settings.uid)
				streamDeck.logger.info(`${device.name}: UID changed ${settings.uid} → ${device.uid}`);
			settings = { ...settings, uid: device.uid, name: device.name };
			await a.setSettings(settings);
		}

		await a.setImage(KEY_IMAGES[keyState(device, mics.snapshot)]);
		await a.setTitle(settings.hideName ? "" : wrapTitle(settings.name ?? (settings.uid ? "?" : "Pick mic")));
	}
}
