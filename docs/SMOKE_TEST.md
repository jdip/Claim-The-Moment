# Foundry smoke-test matrix

Run this checklist against the packaged ZIP before publishing a release. Use Foundry VTT 14.364 or newer in generation 14, Foundryborne Daggerheart 2.5.4 or newer, one GM client, and two player clients. At least one player should have an assigned character and prototype-token image.

## Fresh install and discovery

- Install `dist/claim-the-moment.zip` into a clean Daggerheart world and enable the module without console errors.
- Confirm all three clients see the welcome window with Token Controls → Claim the Moment guidance.
- Select **Don't show this again**, close with Foundry's X, reload, and confirm the welcome stays hidden.
- Re-enable the welcome from Help, reload, and confirm it returns.
- Open the spotlight from Token Controls and with the configured open keybinding on every client.

## Shared state and command acknowledgement

- Toggle each player out and back into contention; verify both player windows update immediately and excluded players stay greyed out after reload.
- Edit both claim totals, reload all clients, and verify the edits persist and the roster stays sorted from lowest to highest.
- Throw the spotlight with one player excluded; confirm only the GM and eligible player auto-open.
- Claim simultaneously from both player clients; confirm exactly one winner and one count increment appear everywhere.
- Disconnect the authority GM tab while a command is pending; confirm another active GM tab takes authority and the command either commits once or reports a timeout.

## Fairness and direct control

- Let a player win, throw again, and allow the next round to end with no eligible winner. Re-enable the table, throw again, and confirm the prior player is still excluded from automatic fallback.
- Confirm the prior player can still claim manually.
- Hand the spotlight directly to each eligible player and confirm their count increments once.
- Take the spotlight as GM during and outside a countdown; confirm player totals do not change and the configured GM icon appears.
- Delete a test user and confirm their stored count/contention data is compacted after the authority processes the deletion.

## Audio, layout, and lifecycle

- Exercise throw, player claim, automatic selection, and GM take; confirm each shared cue plays only after the matching state appears.
- Disable and replace each cue in Module Settings and verify all clients follow the world setting.
- Set one client's module volume to zero and another to a positive value; reload and confirm the preferences remain independent.
- Detach and resize the spotlight, Help, Credits, and welcome windows below 420 px; confirm their container-based compact layouts remain usable and the volume popover stays anchored inside view.
- Verify player-specific labels for contention, claim totals, and handoff controls with a screen reader or browser accessibility inspector.
- Disable and re-enable the module once; confirm no duplicate socket processing, countdowns, sounds, or notifications occur.
