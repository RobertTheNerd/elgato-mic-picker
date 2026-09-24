// Writes the key images used in the README to docs/images/, so the docs always match the plugin.
import { mkdirSync, writeFileSync } from "node:fs";
import { KEY_SVGS } from "../src/icons.ts";

const dir = new URL("../docs/images/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [state, svg] of Object.entries(KEY_SVGS)) {
	writeFileSync(new URL(`key-${state}.svg`, dir), `${svg.trim()}\n`);
	console.log(`docs/images/key-${state}.svg`);
}
