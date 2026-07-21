# Onboarding UX Roadmap

This file tracks durable onboarding and first-use improvements for Claim the Moment. An item is complete only when its acceptance criteria are implemented and covered by automated tests or a documented visual verification.

Last reviewed: 2026-07-20

## P0 — Configurable keyboard access

- [x] Register **Open Claim the Moment** in Foundry's Configure Controls panel.
- [x] Register **Claim the Spotlight** for players in Configure Controls.
- [x] Provide editable defaults which do not fire while the action is unavailable.
- [x] Document the defaults and where to change them in the built-in help and user guide.
- [x] Cover registration and availability guards with automated tests.

## P0 — Readiness and disabled-state guidance

- [x] Show eligible-player and online-player totals together in the roster heading.
- [x] Explain why **Throw the Spotlight** is disabled when no player is online or in contention.
- [x] Keep the countdown-in-progress state distinct from configuration problems.
- [x] Cover the derived readiness states with automated tests.

## P1 — Contextual empty states

- [x] Give the GM a direct next step when no players are online.
- [x] Give the GM a direct next step when online players exist but all are out of contention.
- [x] Give players a clear shared-state explanation when nobody is in contention.
- [x] Avoid relying on disabled buttons alone to communicate these states.

## P1 — Keyboard and screen-reader accessibility

- [x] Keep all interactive controls keyboard reachable with visible focus treatment.
- [x] Prevent the 100 ms visual countdown refresh from flooding assistive technology.
- [x] Announce countdown changes no more than once per displayed second.
- [x] Preserve polite announcements when the spotlight state or winner changes.
- [x] Respect the user's reduced-motion preference.

## P1 — Visual walkthrough for discovery

- [x] Capture a current GM screenshot with the readiness display and help control visible.
- [x] Capture a current player screenshot during an open claim countdown.
- [x] Record a short, captioned animation covering open → throw → claim → winner.
- [x] Add concise alt text and place the media near the top of the README.
- [x] Reuse the same media and summary copy for the Foundry module listing.

This item should be completed only after the updated interface is deployed to the owner-only test server, so the published media matches the release behavior.

Visual verification completed 2026-07-17 after the packaged `0.5.9` module was installed and its manifest verified at the owner-only test server's active module root. The screenshots and animation were rendered from the versioned [`tools/onboarding-media-preview.html`](../tools/onboarding-media-preview.html) harness against the shipped stylesheet and current window structure. The README and [`FOUNDRY_LISTING.md`](FOUNDRY_LISTING.md) reference the same three media files and matching descriptions.
