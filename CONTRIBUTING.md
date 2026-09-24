# Contributing

Thanks for your interest in Mic Picker! Bug reports, ideas, and pull requests are all welcome. By taking part you
agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You'll need macOS, the Xcode Command Line Tools, Node.js 24+ (`nvm use` reads `.nvmrc`), and the Stream Deck app
(7.1+).

```sh
git clone https://github.com/RobertTheNerd/elgato-mic-picker.git
cd elgato-mic-picker
npm install
npm run build
npm run link      # symlink the plugin into Stream Deck (once), then restart the Stream Deck app
```

## Dev loop

```sh
npm run build:js && npm run restart     # JS change
npm run build && npm run restart        # Swift change
```

`npm run restart` stops the plugin process, and Stream Deck relaunches it right away. Don't use
`streamdeck restart`: Stream Deck accepts the request but doesn't always restart the process.

Logs are written to `com.robert.mic-picker.sdPlugin/logs/`.

To attach a debugger, add `"Debug": "enabled"` to the `Nodejs` section of `manifest.json`. Don't commit it: it opens
an inspector port on every user's machine.

## Before you open a PR

```sh
npm run check          # prettier, tsc, unit tests, manifest validation
npm run build
npm run test:native    # micctl smoke tests. They never change your audio settings
```

CI runs the same steps on macOS.

Also:

- **Keep logic testable.** Decisions such as "what does this key look like" or "what does a press do" belong in
  `src/key-state.ts` as pure functions, with tests in `test/`.
- **Try it on a real Stream Deck** and say in the PR which devices you tested with. Devices differ, for example not
  every device has a mute control.
- **Changed a key image?** Run `npm run images` so the README matches.
- **Changed behavior?** Update `README.md` and add an entry under `Unreleased` in `CHANGELOG.md`.

## Style

- Match the surrounding code. Prettier handles formatting: tabs, 120-column lines.
- Swift uses four-space indentation and has no external dependencies. Keep it that way.
- Keep comments to the _why_.

## Releasing (maintainers)

1. Move the `Unreleased` changelog entries under a new version heading.
2. Bump `version` in `package.json` and `Version` in the plugin manifest (for example `0.2.0` and `0.2.0.0`).
3. Commit, then push a tag: `git tag v0.2.0 && git push --tags`.

The **Release** workflow builds the plugin and attaches `com.robert.mic-picker.streamDeckPlugin` to a new GitHub
release.
