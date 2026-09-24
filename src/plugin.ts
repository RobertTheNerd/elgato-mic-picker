import streamDeck from "@elgato/streamdeck";
import { SelectMic } from "./actions/select-mic.ts";
import { mics } from "./mic-monitor.ts";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new SelectMic());
mics.start();
streamDeck.connect();
