# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- A key no longer loses its USB mic after the mic, or the hub it's on, is plugged into a different port. macOS
  gives such devices a new UID, so the key now falls back to the device name (only when exactly one connected
  device has it) and saves the new UID.

## [0.1.0] - 2026-09-24

### Added

- **Select Microphone** key action: pick an input device in the key's settings.
  - Pressing the key when the mic isn't the default input makes it the default.
  - Pressing it again when it's already the default toggles the mic's hardware mute.
- Live key states (active, muted, inactive, missing), updated immediately when the default input, a mute state, or
  the device list changes, including changes made outside Stream Deck.
- Device name as the key title (word-wrapped), with an option to hide it.
- `micctl`, a universal (Apple silicon + Intel) CoreAudio helper with `list`, `set`, `mute`, and `watch` commands.

[Unreleased]: https://github.com/RobertTheNerd/elgato-mic-picker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RobertTheNerd/elgato-mic-picker/releases/tag/v0.1.0
