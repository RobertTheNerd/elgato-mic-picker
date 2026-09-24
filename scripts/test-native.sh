#!/usr/bin/env bash
# Smoke tests for the micctl helper. Safe to run anywhere: it never changes the default input or mute state.
set -euo pipefail
MICCTL="${1:-com.robert.mic-picker.sdPlugin/bin/micctl}"
fail() { echo "✖ $*" >&2; exit 1; }

"$MICCTL" list | node -e '
	const s = JSON.parse(require("fs").readFileSync(0, "utf8"));
	if (typeof s.default !== "string" || !Array.isArray(s.devices)) process.exit(1);
	for (const d of s.devices) if (typeof d.uid !== "string" || typeof d.name !== "string") process.exit(1);
	console.log(`✔ list: ${s.devices.length} input device(s)`);
' || fail "list did not print a valid snapshot"

expect_exit() {
	local want=$1; shift
	set +e; "$MICCTL" "$@" 2>/dev/null; local got=$?; set -e
	[[ $got == "$want" ]] || fail "micctl $* exited $got, expected $want"
	echo "✔ micctl ${*:-(no args)} → exit $want"
}
expect_exit 2
expect_exit 2 set
expect_exit 2 mute some-uid sideways
expect_exit 1 set no-such-device
expect_exit 1 mute no-such-device toggle

# watch prints a snapshot straight away and exits once stdin closes.
line=$(echo | "$MICCTL" watch | head -1)
[[ $line == \{* ]] || fail "watch did not print a snapshot"
echo "✔ watch prints a snapshot and exits on EOF"
