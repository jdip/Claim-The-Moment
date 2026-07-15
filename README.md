# Claim the Moment

Claim the Moment is a collaborative spotlight manager for the Foundryborne Daggerheart system on Foundry Virtual Tabletop.

This is an independent community project and is not affiliated with or endorsed by Darrington Press, Critical Role, Foundry Gaming, or the Foundryborne team.

The GM throws the spotlight to the table, starting a synchronized countdown. The first eligible player to press **Claim the Spotlight** receives it. If nobody claims before time expires, the module selects an eligible online player with the fewest previous spotlight claims; ties are broken randomly.

## Features

- A shared window listing every currently online, non-GM player and their spotlight total.
- A GM-only **Throw the Spotlight** control with a configurable 3–60 second countdown.
- A GM-only **Take the Spotlight** control which immediately ends any open countdown and returns focus to the GM.
- First-click wins, with claim processing serialized by one elected GM client to avoid double winners.
- Automatic least-served selection when the countdown expires, with random tie-breaking.
- The player who held the spotlight immediately before a new throw is excluded from that round's automatic fallback, while remaining free to claim manually.
- GM-only contention toggles. Excluded players remain visible but are greyed out for everyone.
- GM-only manual total editing and a confirmed reset-all action.
- Persistent world-level totals and contention choices in one authoritative world setting, including for players who disconnect and return.
- Assigned character names and prototype-token art in the roster and winner display when available.
- A configurable purple skull portrait whenever the GM holds the spotlight.
- Automatic window opening for the GM and eligible connected players whenever a new countdown begins; excluded players are not interrupted.
- Four shared cues: a cinematic BRAAAM when the spotlight is thrown, a heroic horn for player claims, a flourish for automatic selection, and a scary string sting when the GM takes it.
- Independent on/off toggles and Foundry file pickers for replacing each sound.
- A per-user mute control in the spotlight window which persists independently for that user in the world.
- A Token Controls button for reopening the window at any time.

## Compatibility

This initial release targets and is verified against:

- [Foundry VTT 14.364](https://foundryvtt.com/releases/14.364)
- [Foundryborne Daggerheart 2.5.4](https://github.com/Foundryborne/daggerheart/releases/tag/2.5.4)

The manifest supports Daggerheart 2.5.4 or newer on Foundry VTT generation 14.

## Installation

In Foundry's **Add-on Modules** screen, select **Install Module**, paste this manifest URL, and choose **Install**:

```text
https://github.com/jdip/Claim-The-Moment/releases/latest/download/module.json
```

Enable **Claim the Moment** from **Manage Modules** in a Daggerheart world, then reload the world when prompted.

## Using the module

1. Open **Claim the Moment** from the wand-and-sparkles button under Token Controls.
2. The GM checks which online players are in contention and adjusts totals if needed.
3. The GM presses **Throw the Spotlight**, or **Take the Spotlight** to bring focus back immediately.
4. Eligible players press **Claim the Spotlight** before time runs out.
5. The winner's total increments automatically, whether claimed or assigned by the fallback.

The countdown length, all four sound toggles and files, and the GM spotlight icon are available under **Configure Settings → Module Settings → Claim the Moment**. The audio and image fields open Foundry's file picker, where the GM can browse or upload a replacement.

Every user can mute or unmute Claim the Moment from inside the spotlight window. This preference is stored separately for each user in the current world and follows that user across browsers and devices.

Only online, non-GM users can claim or be selected automatically. If every eligible player disconnects or is excluded during an open countdown, that round ends without a winner.

## Macro API

The module exposes a small API for macros:

```js
const api = game.modules.get("claim-the-moment").api;
api.open();
await api.throwSpotlight(); // GM only
await api.takeSpotlight(); // GM only
console.log(api.getState());
```

## Development

The module uses browser-native ES modules and has no runtime or build dependencies.

```bash
npm test
npm run check
npm run package
```

The package command creates the two GitHub release assets expected by the manifest: `dist/module.json` and `dist/claim-the-moment.zip`.

The pure state transitions are covered by Node's built-in test runner. Full socket and UI behavior should also be smoke-tested with at least one GM and two player browser sessions in Foundry.

## License

[MIT](LICENSE)

The bundled audio is available under CC0 and CC BY 4.0 licenses. See [sounds/LICENSE.md](sounds/LICENSE.md) for source links, attribution, and adaptation details.
