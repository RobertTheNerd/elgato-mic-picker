// Key images, rendered as SVG data URLs so they can be tinted per state.
import type { KeyState } from "./key-state.ts";

const mic = (color: string, background: string, extra = "") => `
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${background}"/>
  <g fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round">
    <rect x="56" y="22" width="32" height="60" rx="16" fill="${color}"/>
    <path d="M42 66a30 30 0 0 0 60 0"/>
    <path d="M72 96v18M56 116h32"/>
  </g>
  ${extra}
</svg>`;

const slash = (color: string) => `<path d="M30 30L114 114" stroke="${color}" stroke-width="9" stroke-linecap="round"/>`;

/** Raw SVG markup per key state (also used by `scripts/render-key-images.ts` for the docs). */
export const KEY_SVGS: Record<KeyState, string> = {
	active: mic("#2ecc71", "#0f2a1a"),
	muted: mic("#e74c3c", "#3a1010", slash("#e74c3c")),
	inactive: mic("#6b6b6b", "#1b1b1b"),
	missing: mic("#6b6b6b", "#1b1b1b", slash("#6b6b6b")),
};

const toUrl = (svg: string) => `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;

export const KEY_IMAGES = Object.fromEntries(
	Object.entries(KEY_SVGS).map(([state, svg]) => [state, toUrl(svg)]),
) as Record<KeyState, string>;
