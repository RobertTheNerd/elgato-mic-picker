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
import { keyState, pressAction, wrapTitle } from "../key-state.ts";
import { mics } from "../mic-monitor.ts";

type Settings = {
	/** CoreAudio device UID of the configured microphone. */
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
		const device = mics.find(ev.payload.settings.uid);
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
		const device = mics.find(settings.uid);

		// Remember the device's name so it can still be shown while it's disconnected.
		if (device && device.name !== settings.name) {
			settings = { ...settings, name: device.name };
			await a.setSettings(settings);
		}

		await a.setImage(KEY_IMAGES[keyState(device, mics.snapshot)]);
		await a.setTitle(settings.hideName ? "" : wrapTitle(settings.name ?? (settings.uid ? "?" : "Pick mic")));
	}
}
