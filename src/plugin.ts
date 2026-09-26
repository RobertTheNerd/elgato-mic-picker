import streamDeck from "@elgato/streamdeck";
import { SelectMic } from "./actions/select-mic.ts";
import { mics } from "./mic-monitor.ts";
import { preferredMic } from "./preferred-mic.ts";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new SelectMic());
mics.start();
await streamDeck.connect();
await preferredMic.start();
