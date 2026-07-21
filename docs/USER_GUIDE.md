# Claim the Moment User Guide

Claim the Moment helps a Daggerheart table deliberately pass narrative focus between the GM and players. Everyone sees the same spotlight state, eligible players can race to claim an open moment, and the module keeps a simple count so quieter players are not forgotten.

## Opening Claim the Moment

The Claim the Moment window is available to every connected user:

1. Open **Token Controls** in Foundry's scene-controls bar on the left side of the screen.
2. Select the **Claim the Moment** button labeled **Open Claim the Moment**.

The default keyboard shortcut is **Shift+M**. Players can press **Shift+C** to claim while an eligible spotlight is open. Both shortcuts can be changed or removed under **Game Settings → Configure Controls → Claim the Moment**.

When the GM throws the spotlight, the window opens automatically for the GM and every eligible online player. A player who is out of contention remains undisturbed.

Select the **?** button in the bottom-left corner of the Claim the Moment window whenever you want to reopen the built-in help.

## Player quick start

1. Check the roster to see whether you are in contention. Players who are out are greyed out.
2. When the GM throws the spotlight, the countdown begins and eligible player windows open automatically.
3. Select **Claim the Spotlight** if you want the moment. The first eligible claim received by the GM wins.
4. Use the sound button in the bottom-right corner to set your personal Claim the Moment volume. Setting it to zero silences the module for you without affecting anyone else.

If nobody claims before the timer expires, the module chooses an eligible player with the lowest spotlight count. Ties are broken randomly. The player who held the immediately previous player spotlight is excluded from this automatic choice, but may still claim manually.

## GM quick start

1. Use each player's contention toggle to decide who can claim or be selected automatically.
2. Select **Throw the Spotlight** to open a timed claim for eligible players.
3. Select **Take the Spotlight** whenever the GM needs to frame danger, introduce a consequence, or move the scene forward.
4. Use the hand button on an eligible player's row to award the spotlight directly without starting a countdown.
5. Edit a player's claim total directly when a correction is needed, or use **Reset All** to return every total to zero.

The roster heading shows both online and eligible totals. When **Throw the Spotlight** is unavailable, the message beneath it explains whether players still need to connect or be brought into contention.

Contention choices and spotlight totals are stored for the world. They survive reloads and players disconnecting or returning.

## How automatic selection stays fair

Automatic selection considers only players who are:

- currently online;
- not a GM; and
- marked in contention by the GM.

Among those players, the lowest spotlight total wins. When several players share the lowest total, one is selected randomly. The most recent player spotlight holder is always omitted from the automatic fallback for the next throw, but remains free to claim manually.

## Names and portraits

When a Foundry user has a character assigned, Claim the Moment uses that character's name and prototype-token artwork. Otherwise it uses the Foundry user's name and initial.

The GM portrait can be replaced under **Configure Settings → Module Settings → Claim the Moment**.

## Sound and personal volume

The GM can enable, disable, or replace the shared sounds for throwing, player claims, automatic selection, and the GM taking the spotlight.

Every user has a separate volume control in the Claim the Moment window. This preference affects only Claim the Moment and is stored independently for that user in the current world.

## Welcome message

Claim the Moment shows a short welcome message when a user enters the world. Select **Don't show this again** to disable it for your user. You can restore it later either from the **Welcome reminder** section of the built-in Help window or with **Show Welcome on Login** under **Configure Settings → Module Settings → Claim the Moment**.

## Troubleshooting

- **The window did not open when the spotlight was thrown:** Confirm that you are online and in contention. You can always open it manually from Token Controls.
- **The claim button is disabled:** The GM has not opened a countdown, the countdown has expired, or you are out of contention.
- **No player was selected automatically:** No eligible non-GM player remained online when the countdown ended.
- **You cannot change contention or totals:** Those controls are available only to the GM.
- **You cannot hear the cues:** Open the bottom-right sound control and raise your personal volume. The GM may also have disabled or replaced that cue.

## Macro API

Advanced users can open the window from a macro:

```js
game.modules.get("claim-the-moment").api.open();
```

The complete macro API is documented in the project [README](../README.md#macro-api).
