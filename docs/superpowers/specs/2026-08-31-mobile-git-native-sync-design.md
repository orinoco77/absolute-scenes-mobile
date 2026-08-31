# Mobile Git-Native Sync Design

## Context

`absolute-scenes-mobile` is a fully static React SPA (Vite, deployed via
GitHub Pages, no backend of any kind) — a mobile-optimized website, not a
native app. It has never been properly rolled out, because its sync
implementation (a separate, hand-rolled stack: `browserEnhancedGitHubService.js`,
`gitHubService.js`, `syncQueueService.js`, `indexedDBService.js`) could
never be relied on. That stack shares no code with the desktop app and has
independently accumulated the same category of bugs desktop's old
hand-rolled sync stack had before it was replaced by the
`@absolute-scenes/git-sync` package (see `absolute-scenes-git-sync` and
the desktop app's own sync rework). A local branch with 13 commits of
further patches to the old stack (`fix/github-sync-rework`) was deleted at
the start of this work — confirmed to have no salvageable value once the
shared package is in play.

This spec covers replacing mobile's sync/data layer with
`@absolute-scenes/git-sync`, the same package desktop uses, so both
platforms share one tested implementation of the actual git operations and
merge logic. Scope beyond sync (navigation/book-overview UX, output
generation) is explicitly deferred — see Non-Goals.

**Positioning:** this app exists to let the user keep writing while away
from their desk. It is not, and is not trying to become, a full-parity
editor. "I can live with [missing output generation] in an app designed
just to keep you working while you're away from your desk, but it's not
ideal" — direct user framing for how much this needs to do.

**Platform constraint, stated directly by the user:** "It has to work on
phones, but it cannot actually be a phone app," because there's no budget
for an Apple developer license or Android store certification. It must
work in any reasonably capable phone browser without app-store
distribution — no dependence on install-only or Chrome-only capabilities
(e.g. the Background Sync API, which iOS Safari doesn't support at all).

## Goals

- Replace mobile's sync engine with `@absolute-scenes/git-sync`, the same
  package desktop uses — same git operations, same merge semantics, same
  conflict behavior.
- Promote the two orchestration-level fixes that currently live only in
  desktop's own `gitSyncService.js` — the in-flight-edit reconciliation
  and "first sync against an already-populated repo pulls, not
  pushes-with-merge" — into the shared package, so mobile does not have to
  independently re-derive (and risk getting wrong) either fix.
- Get to a real, live-testable round trip (sign in, connect a repo, see
  and edit one real scene, sync, verify the commit) as the *first* unit of
  delivered work, before any further feature is built on top of it.
- Design the sync trigger model around an actual browser tab's lifecycle
  (backgroundable, suspendable, no reliable close hook, no trustworthy
  background timer) rather than porting desktop's Electron-process-shaped
  trigger model unmodified.
- Treat offline editing as first-class: show local content immediately on
  load without blocking on the network, and sync eagerly whenever
  connectivity exists or returns.

## Non-Goals (this pass)

- Output generation (PDF/print export) — explicitly out of scope; the
  user is fine without it for this app's purpose.
- Overhauling book-overview/navigation UX — real, acknowledged pain
  ("difficult to get an overview of the book as a whole"), but sequenced
  as separate follow-up work *after* the sync foundation is proven, not
  bundled into this pass.
- Guaranteeing correctness for weeks-long fully-offline sessions. The
  merge algorithm itself doesn't care how stale the base is, but this is a
  static web app with no filesystem — IndexedDB has no durability
  guarantee equivalent to a real local file, and can be evicted by the
  browser under storage pressure or tracking-prevention-style cleanup,
  especially on iOS Safari. This spec designs for "sync eagerly the
  moment connectivity exists," not for guaranteeing survival of arbitrarily
  long offline stretches. `navigator.storage.persist()` (requested,
  best-effort, not guaranteed on all platforms) and a manual local-state
  export/backup escape hatch are noted as future hardening, not built here.
- Changing the auth model (GitHub PAT stored in `localStorage`, no
  backend). This is an existing, already-accepted tradeoff for a
  no-backend static site and is not revisited by this spec.

## Architecture

Three layers:

1. **`@absolute-scenes/git-sync`** (shared, existing package) — unchanged
   in its core git-level responsibility (`pushSync`, `pullSync`,
   `projectBook`/`reassembleBook`, `mergeSceneContent`,
   `mergeBookMetadata`, `detectRepoLayout`/`migrateLegacyRepo`). This spec
   adds two things to it (see "Promoting the orchestration fixes" below).
2. **A mobile orchestration layer**, structurally mirroring desktop's
   `gitSyncService.js` (`syncBook`/`runSync`, an in-flight guard), but with
   an IndexedDB-backed `cache` implementation instead of desktop's
   Electron-IPC sidecar-file cache.
3. **Local persistence.** There is no local `.book` file on mobile. The
   book is an in-memory state object (same shape as desktop's `book`)
   that is persisted to IndexedDB on every change and rehydrated from
   IndexedDB on load. This plays the same role desktop's local file plays
   — the durable record of whatever hasn't been pushed yet — just backed
   by browser storage instead of a filesystem.

### Promoting the orchestration fixes into the shared package

Two fixes found live during desktop testing currently live only in
`absolute-scenes`'s `gitSyncService.js`, not in `@absolute-scenes/git-sync`
itself:

- **In-flight-edit reconciliation** (`postSyncReconciliation.js`'s
  `reconcilePostSyncState`): treats sync completion as a 3-way merge
  (pre-sync snapshot vs. current live state vs. the sync's own result)
  instead of an unconditional replace, so an edit made while a sync's
  async round-trip was still in flight survives.
- **First-sync-pulls-not-pushes**: a device's first-ever sync against a
  repo that already holds real content (freshly migrated, or already in
  the new layout) must pull that content wholesale rather than feeding
  `pushSync` a base commit the local book was never actually derived
  from — otherwise the next push reads all that content as "deleted
  locally" and wipes it.

Both are logically part of "how to safely drive `pushSync`/`pullSync`,"
not desktop-specific. This spec promotes both into
`@absolute-scenes/git-sync` (exact export shape — e.g. a single
higher-level `syncBook`-style orchestration function both platforms call,
parameterized by a platform-supplied cache — is a decision for the
implementation plan, not this spec) so mobile does not reimplement either
one from scratch and risk reintroducing the bugs they fixed. Desktop's own
`gitSyncService.js` is updated to call the promoted versions instead of
its local copies, once they exist in the package.

### Local persistence / cache mapping

The `@absolute-scenes/git-sync` package's `cache` parameter is a plain
`{get(path), set(path, entry)}` interface (see desktop's
`createSyncCache`, backed by a JSON sidecar file over Electron IPC).
Mobile implements the same interface backed by IndexedDB (the `idb`
package already in mobile's dependencies), keyed by repo instead of by
file path (mobile has no file path — a repo *is* the identity of a book
here).

The book state itself (distinct from the blob-sha cache above) is stored
in IndexedDB too, as the local record of "what this device currently has,
including anything not yet pushed." On load, this is read and rendered
immediately, before any network activity — see Data Flow.

### Sync trigger model

Desktop's trigger model (blur, a 2-minute periodic timer, scene-switch,
Electron's close hook, manual save) assumes a long-lived process with a
reliable shutdown hook and a background timer that can be trusted to keep
firing. Neither holds for a browser tab, which can be silently suspended,
throttled, or killed by the OS at any point with no warning — particularly
on iOS Safari, the most restrictive mainstream mobile browser, which this
spec treats as the binding constraint (per "any reasonably equipped
phone").

Mobile's triggers:

- **On load / app becoming visible again** — equivalent to desktop's
  `handleBookLoaded` auto-sync, but re-fires every time the tab regains
  foreground (covers the "app was backgrounded and possibly evicted, now
  it's back" case that desktop never had to handle).
- **On `visibilitychange` to hidden** — closest browser analog to
  desktop's blur/close triggers; fires when the user switches apps, locks
  the phone, or backgrounds the tab.
- **On scene-switch** — same rationale as desktop.
- **On the `online` event** — new relative to desktop: retry a sync
  immediately when connectivity is restored, rather than waiting for the
  next passive trigger. Matters much more here than on desktop, given the
  explicit "away from your desk, possibly flaky connectivity" use case.
- **A foreground-only periodic tick**, as a safety net while the tab is
  actively open and visible — not trusted to fire while backgrounded, so
  it is not relied on the way desktop's periodic timer is.

## Data Flow

1. On load: read the locally persisted book from IndexedDB and render it
   immediately, without waiting on any network round trip. Offline-first —
   blocking the UI on a network call is hostile given the target use case
   (unreliable mobile connectivity).
2. A sync attempt runs in the background against whichever trigger fired;
   the view updates when it resolves (or is left as-is, with a staleness
   indicator, if it fails or there's no connectivity — see Error
   Handling).
3. Edits update the in-memory book state immediately and are persisted to
   IndexedDB on a short debounce, independent of whether a sync has
   happened yet — mirrors desktop's local-disk autosave, just to
   IndexedDB instead of a file.

## Error Handling

- Background/passive sync triggers fail silently, matching desktop's
  existing pattern (a transient offline blip shouldn't interrupt writing).
- Unlike desktop, the UI shows a small non-blocking staleness indicator
  ("synced 3h ago" / "offline — will sync when connection returns"),
  since not knowing how stale the local copy is matters more for an
  offline-first, away-from-desk tool than it does for desktop's
  near-constant-connectivity assumption.
- Storage eviction (see Non-Goals) is not actively defended against in
  this pass beyond requesting persistent storage where the browser
  supports it (`navigator.storage.persist()`, best-effort, silently a
  no-op where unsupported).

## Testing

- Unit tests via the mobile repo's existing Jest setup, following the
  same regression-test discipline used throughout the desktop work
  (write the failing test first, confirm RED without the fix, confirm
  GREEN with it).
- Real-device verification: run the Vite dev server with `--host` so it's
  reachable over the local network, and test directly from a real phone
  browser pointed at the dev machine's LAN address — no deploy step
  needed for the fast iteration loop. Every sync result is verified
  directly against the GitHub API (commits, tree contents), not just
  trusted from the UI, matching how every fix this session was confirmed.
- The very first implementation task is the full walking skeleton (sign
  in, connect a repo, see and edit one real scene, sync, verified via a
  real commit) — checked on a real phone before any further feature is
  built on top of it. Each subsequent increment gets its own real-device
  check before the next one starts.

## Open Questions / Deferred to Implementation Plan

- Exact shape of the promoted shared-package orchestration function
  (parameter list, how a platform supplies its cache implementation).
- Whether mobile's existing UI components (`RepositoryList.jsx`, etc.) are
  salvageable as-is once the data layer underneath changes, or need
  rewriting — a plan-level, not spec-level, decision, resolved incrementally
  per Approach C's spirit (drop and rebuild anything more trouble to port
  than to redo).
- Whether/when to add the local-state export/backup safety valve noted
  under storage eviction risk.
