# Architecture

Mic Picker has two parts: a Node.js Stream Deck plugin, and `micctl`, a small Swift helper that talks to
CoreAudio. They communicate over the helper's stdin/stdout.

```
┌───────────────┐  WebSocket  ┌───────────────────────────┐  stdout: JSON lines  ┌───────────────┐
│ Stream Deck   │◀───────────▶│ plugin.js (Node 24)       │◀─────────────────────│ micctl watch  │
│ app + PI page │             │  SelectMic action         │                      │ (long-lived)  │
└───────────────┘             │  MicMonitor               │  execFile            ├───────────────┤
                              │                           │─────────────────────▶│ micctl set    │
                              └───────────────────────────┘                      │ micctl mute   │
                                                                                 └──────┬────────┘
                                                                                        │ CoreAudio
                                                                                        ▼
                                                                              audio devices / HAL
```

## Why a native helper?

Node has no built-in way to read or change the macOS default input device. The usual workaround is to shell out to
`SwitchAudioSource`, but that makes users install Homebrew packages. `micctl` is about 150 lines of Swift, built as
a universal binary, and ships inside the plugin, so the plugin works with nothing else installed.

## `micctl`

Source: [`native/micctl.swift`](../native/micctl.swift).

- **`list`** prints one JSON snapshot:
  `{"default": "<uid>", "devices": [{"uid", "name", "muted"?}]}`. Only devices that have input channels are
  included. `muted` is left out for devices without a settable input mute control. Keys are sorted, so the same
  state always produces the same text.
- **`set <uid>`** sets `kAudioHardwarePropertyDefaultInputDevice`.
- **`mute <uid> on|off|toggle`** sets `kAudioDevicePropertyMute` on the device's input scope, main element.
- **`watch`** prints a snapshot straight away. It then registers CoreAudio property listeners for the default input
  device, the device list, and each device's input mute, and prints a new snapshot whenever the output would
  differ. Mute listeners are attached again whenever the device list changes, so new devices are covered. The
  process exits when its stdin closes. This way it never outlives the plugin, even if the plugin crashes.
  After the Mac wakes from sleep (`NSWorkspace.didWakeNotification`), `watch` also prints `{"event":"wake"}`. It
  runs the main run loop rather than `dispatchMain()`, because `dispatchMain()` doesn't deliver NSWorkspace
  notifications.

## Plugin

Source: [`src/`](../src).

| File                    | Responsibility                                                                   |
| ----------------------- | -------------------------------------------------------------------------------- |
| `plugin.ts`             | Entry point: registers the action, starts the monitor, connects to Stream Deck.  |
| `mic-monitor.ts`        | Runs `micctl watch`, keeps the latest snapshot, restarts the helper if it exits. |
| `preferred-mic.ts`      | The preferred mic (global settings); makes it the default when it should.        |
| `key-state.ts`          | Pure logic: key state, press outcome, device lookup, preferred-mic rule, titles. |
| `icons.ts`              | SVG key images per state, sent to the key as data URLs.                          |
| `actions/select-mic.ts` | The **Select Microphone** action: renders keys, handles presses and the PI.      |
| `types.ts`              | Shared snapshot types.                                                           |

### Data flow

1. `MicMonitor` emits `change` on every snapshot. `SelectMic` then re-renders every visible key and pushes the
   device list to the property inspector, if it's open.
2. A key press uses `pressAction()` to pick one of three outcomes: `make-default`, `toggle-mute`, or `alert`. It
   then runs `micctl set` or `micctl mute`. The plugin never redraws the key itself after a press. The change
   comes back through `watch`, so keys stay correct even when a change is refused or made elsewhere.
3. `PreferredMic` listens for snapshots and wake events. `preferredToRestore()` decides whether the preferred mic
   should become the default. It does so on the first snapshot after the plugin starts, when the mic wasn't in the
   previous snapshot (it just connected), or on wake (checked 2 s after wake so devices can settle). It never does
   so when the mic is already the default. Because other changes are ignored, switching mics by hand sticks.

### Preferred mic

The preferred mic is stored once in the plugin's global settings as `{ preferred?: { uid, name } }`, so it doesn't
depend on which profile or page is showing. Each key's `preferred` checkbox mirrors it:

- Ticking the box on a key makes that key's mic the preferred mic.
- Unticking it clears the preferred mic.
- Whenever a key is shown, its checkbox is set to match, so at most one mic is ever ticked.

### Settings

Each key stores the following in the Stream Deck profile:

```ts
{ uid?: string; name?: string; hideName?: boolean; preferred?: boolean }
```

- `uid` is the CoreAudio device UID. It's usually stable, with one exception: USB audio devices without a serial
  number get a UID built from their USB port location, for example
  `AppleUSBAudioEngine:C-Media Electronics Inc.:JLab GO Talk:22200000:2`. Plugging the device, or its hub, into a
  different port changes the UID.
- `name` is kept in sync while the device is connected, so an unplugged mic still has a label.

`resolveDevice()` in `key-state.ts` looks up a key's device by `uid` first. If that fails, it tries `name`, but
only when exactly one connected device has that name. When the fallback matches, the key saves the new UID.

### Property inspector

[`ui/select-mic.html`](../com.robert.mic-picker.sdPlugin/ui/select-mic.html) uses the vendored
[sdpi-components](https://sdpi-components.dev). The dropdown's `datasource="getDevices"` sends `getDevices` to the
plugin. The plugin replies with `{ event: "getDevices", items: [{ label, value }] }`. Thanks to `hot-reload`, the
list refreshes live when devices come and go.
