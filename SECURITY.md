# Security policy

## Supported versions

Only the latest release gets fixes.

## Reporting a vulnerability

Please **don't** open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/RobertTheNerd/elgato-mic-picker/security/advisories/new).
You should get a reply within a week.

## What the plugin can do

This is useful to know when judging impact:

- The bundled `micctl` helper uses public CoreAudio APIs to read the list of input devices, change the system
  default input, and change a device's input mute. It doesn't record, read, or send audio.
- The plugin makes no network requests. The settings page loads only files bundled with the plugin.
- Settings (a device UID and name per key) are stored by the Stream Deck app in its profile files.
