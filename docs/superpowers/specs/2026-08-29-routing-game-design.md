# Catalog routing game — prototype design

Date: 2026-08-29
Status: approved for planning, scoped to a single validation prototype
Builds on: the ReshapeX knowledge graph animation in this repo

## What changed and why

Earlier drafts of this document specified a full roguelite: sixteen-plus waves, an upgrade pool,
between-wave events, a standing configuration, a daily mode, a balance simulator and a video share
pipeline. Three review passes — adversarial game design, technical feasibility against this
codebase, and commercial — converged on the same verdict, so this version is deliberately much
smaller.

The three findings that forced the rescope:

1. **The economy was broken in a way that deleted the game.** At the previously stated numbers a
   player needed 85% confidence before answering beat escalating, and escalation also preserved the
   streak and made later queries easier. The optimal strategy was "never take a risk", which is the
   opposite of the intended experience.
2. **Each fix had been applied locally without checking it against the others.** Ambiguity was added
   to keep the confidence dial alive, then per-slot validation was added that resolved that
   ambiguity for 15% of points. The two headline mechanics were load-bearing in opposite directions.
3. **The effort was roughly four to six months against an unvalidated hypothesis**, and the
   kill gate sat *after* the two most expensive commitments. Nobody had established that a
   one-minute version of this is fun or that anyone in the target audience wants it.

So this spec covers **one wave, one minute, one question**: is routing an ambiguous catalog query
under a clock actually fun, and does anyone care? Everything else is deferred to an appendix and
earns its way in only if the prototype succeeds.

**Branding note.** Earlier drafts framed this around a named customer. That was only ever an
illustrative example and the project has no connection to that company. All catalog content here is
synthetic industrial end-of-arm-tooling vocabulary, chosen because it is generic to the category.
No real part numbers, customer names, or customer figures appear.

## The hypothesis under test

> Routing an under-specified catalog query under time pressure — and choosing between answering,
> checking, and handing it to a human — is engaging enough that people play it more than once and
> that industrial-sector visitors find it worth their time.

If that is false, no amount of roguelite depth rescues it. If it is true, the appendix describes
what to build next.

## The player is the engineer, not the AI

The player is an **applications engineer** buried in customer queries: a clock, ambiguous specs, and
a catalog with more valid combinations than anyone can hold in their head. This is a life the target
audience has actually lived, so failure reads as sympathy rather than as a product defect.

Earlier drafts cast the player as the AI, which meant the game simulated the ungrounded status quo
and the player never experienced anything resembling the product. The inverted casting also sets up
the eventual arc: grounding arriving as relief.

**The word "hallucination" does not appear in the UI.** It is an AI-industry defect term and the most
loaded string in the design. A wrong chain is a *bad callout*, and the failure readout says which
part was wrong.

## Core loop

### The query

A query is a customer spec requiring a chain of three modules:

```
UR10e · 12.5 kg · palletizing
  slot 1  tool changer        rated for the payload
  slot 2  gripper             suited to the application
  slot 3  robot-side adapter  matching the robot flange family
```

Fill each slot by **clicking the arm, then the band**. Two actions per slot. On commit the signal
races down the spoke and blooms the chosen band — the existing animation's visual, kept as a result
rather than used as an input. That keeps the feel and makes the game touch-native.

### Ambiguity is priced, not hidden

This is the one genuinely good idea from the earlier drafts and it is the centre of the prototype.

Queries do not all determine a single answer. Each query resolves to **N candidate chains**, and N is
shown to the player:

- **N = 1** — the spec fully determines the answer.
- **N = 2** — a required attribute is missing; two chains remain valid.
- **N = 3+** — badly under-specified or self-contradictory.

Showing N is deliberate, and it is what separates this from the earlier draft. If N is hidden,
noticing ambiguity is itself catalog knowledge, which decays as the player learns the map — the
exact failure that killed the earlier design. With N shown, the decision is **bet sizing against
stated odds**, which stays interesting at every skill level. Poker survives mastery; trivia does not.

### The three choices, and the economy

| Action | Payout | Notes |
| --- | --- | --- |
| **Answer** | +100 x N if correct, **-100** if wrong | Reward scales with the risk taken |
| **Check** | Costs one of 2 charges | Reports **sufficiency**, not correctness (below) |
| **Escalate** | **+50 flat** | Hand to a human. Never wrong, never brilliant |

Those three numbers were solved, not guessed, so that ambiguity is a live gamble:

| N | Correct pays | EV of answering | vs escalate | Correct play |
| --- | --- | --- | --- | --- |
| 1 | 100 | 100 | 50 | Answer |
| 2 | 200 | 50 | 50 | **Dead even — a genuine judgment call** |
| 3 | 300 | 33 | 50 | Escalate |

A sure thing is worth answering, a coin flip is a real toss-up decided by temperament, and three-way
ambiguity should go to a human. That is the product thesis as an arithmetic fact, and the player can
compute it themselves.

### Check reports sufficiency, not correctness

Spending a check charge tells the player **which slot the spec fails to determine, and how many
candidates remain** — never which candidate is right.

In the earlier draft, checking resolved the ambiguity it was priced against, which made it a paid
answer key and cancelled out the mechanic it was supposed to support. Reporting sufficiency keeps it
a real "which slot do I spend certainty on" decision, and it stays useful no matter how well the
player knows the catalog.

### Failure teaches

A wrong chain shows **which slots were wrong** and highlights the correct band once, briefly.

The earlier draft punished a wrong answer with a score loss and no information. A game built on
learning an unlabelled map that does not close the loop on failure produces resentment rather than
mastery.

## Session shape

**Sixty seconds. One wave. No upgrades, no trust bar, no waves beyond the first, no meta.**

Six queries, arriving one at a time, mixed across N = 1, 2 and 3. A clock per query, generous enough
to read the spec (see below). Final score at the end, and a single button: play again.

That is the entire prototype. The score exists only to make the dial meaningful.

### Onboarding, and the honest gate

Query 1 is a **no-fail visual match**: the glyph on the query card matches exactly one band, all
others dimmed, a ghost cursor demonstrates the verb once, no clock. Query 2 turns on the clock.
Query 3 introduces N = 2 and the escalate button. Query 4 introduces checking.

Bands are labelled throughout the prototype. Unlabelled bands are a mastery mechanic for a game that
runs longer than a minute, and testing memorization in a sixty-second session would measure nothing.

**The clock must budget reading time**, which no earlier draft did. Start at 20 seconds for query 1
and 12 seconds thereafter, and treat those as measurements to take rather than numbers to trust.

## Kill criteria

Decided now so the gate can actually close. Judged by whoever runs the sessions, not by the author.

1. **Comprehension:** 8 of 10 naive testers complete their first **live** query — clock running,
   scoring on — unaided.
2. **Pull:** 5 of 10 press play again without being prompted.
3. **The dial is used:** across all sessions, escalate is chosen on at least 20% of N >= 2 queries
   and at most 80%. Outside that band the dial is either a dead button or a dominant strategy, and
   the economy is wrong.
4. **Legibility:** a selected band is unambiguously readable through bloom and the trail
   accumulator. Currently untested and a real risk.
5. **Touch:** minimum band touch target >= 44 CSS px on a 390 px viewport. If bands are smaller than
   a fingertip, mobile is not real regardless of the verb.

Criteria 3, 4 and 5 exist because earlier drafts asserted them rather than measuring them.

## Architecture

### Standalone, and it does not touch `main.ts`

The prototype ships as its own page and entry point, importing the renderer modules it needs. It does
**not** refactor `main.ts`.

`main.ts` is roughly a thousand lines of module-level singletons with no teardown, so a game that
restarts genuinely cannot live inside it — but that refactor is three to five weeks of invisible work
with zero learning attached, and putting it before the kill gate was the worst sequencing decision in
the earlier drafts. A single sixty-second session with a full page reload on "play again" needs none
of it.

### Modules

```
game/catalog.ts       catalog shape + compatibility rules, behind a CatalogSource interface
game/catalog-fixture.ts  the authored synthetic catalog (the only implementation for now)
game/query.ts         seeded query generation, N-candidate resolution
game/state.ts         score, slots, charges — a pure reducer
                      ────── boundary: nothing above imports Three.js ──────
game/bridge.ts        game state -> start-time writes on the renderers
game/input.ts         selection and hit testing
game/hud.ts           DOM: query card, N indicator, slots, charges, score
game/main.ts          the standalone entry point
```

### The Neo4j seam

A future iteration drives the graph from real product data in Neo4j, so **`catalog.ts` defines a
`CatalogSource` interface from day one** — categories, bands, module attributes, compatibility rules
— with the synthetic fixture as its only current implementation.

This costs nothing now and is the difference between swapping a data source later and rewriting the
game. Everything downstream (query generation, N resolution, compatibility checking) must depend on
the interface, never on the fixture. Two constraints follow and should be honoured now: the interface
is **async**, because a graph query is, and it must expose **band ordering** explicitly rather than
letting geometry imply it, because the renderer's layout is derived from the catalog and not the
other way round.

### The seam into the renderer, as it actually is

Verified against the code rather than assumed:

- **Nodes** already consume per-node start times (`aIgnite`); adding a runtime setter alongside the
  existing `setUnfurl()` is a few lines.
- **Edges do not.** Timing is per-*vertex* (a spoke expands to forty vertices), the edge-to-vertex map
  is discarded after construction, and there are no setters. Runtime edge timing should route through
  the existing per-edge `uDynamic` data texture, which has two unused channels.
- **`envelope()` assumes a twenty-second loop** across two CPU copies and two compiled shaders, and
  activation is evaluated at both `t` and `t + LOOP` and maxed — so "time is modulo 20s" is
  structural, not a constant. The prototype sidesteps this by keeping sessions under one loop length
  and disabling the fold; the real fix belongs to whatever comes after.
- **`pickNode()` does not model the vertex shader's dormant-node drift and has no depth ordering**, so
  the CPU hit test already disagrees with what is drawn for unlit nodes. This is a live bug today and
  it must be fixed for the prototype, because selection accuracy is the core interaction.
- **Camera** must have pointer parallax and micro-drift explicitly disabled; both are live in
  `cameraRig` and both would break the locked framing.

### Determinism

The seeded `mulberry32` PRNG carries over, so a session is a seed plus recorded inputs. Note that
`Math.random()` is called in `inject()` and in `audio.ts`; the prototype must not route through
`inject()`.

## Testing

- **Unit** — pure game logic: N resolution, compatibility rules, scoring, check semantics. No browser.
- **Determinism** — same seed and input log produces an identical final state.
- **Visual** — the legibility check in kill criterion 4, and the touch-target measurement in 5.
- **No balance simulator.** Six queries have no balance surface worth simulating, and building one
  before knowing whether the loop is fun would be the same mistake at a smaller scale.

## Instrumentation

Without this the commercial question stays unanswerable, and no earlier draft had a plan.

- Funnel: landed, first interaction, query 1 completed, session completed, play-again pressed
- Drop-off at the thirty-second mark specifically
- Per-query choice mix (answer / check / escalate) broken down by N — this is what kill criterion 3
  is measured from
- Referrer and, in aggregate only, visitor company domain, to answer whether industrial-sector
  visitors are reaching it at all
- Client-side, aggregate, no personal data

## Out of scope for the prototype

Everything below is deferred, not rejected. Each earns its way in only if the prototype clears its
gate.

Waves and escalating difficulty; the upgrade pool and the keystone; between-wave events; trust as a
life bar; the standing cache; capacity allocation; spending score for speed; the inbox; unlabelled
bands and the memorization curve; daily mode and share text; the cinematic replay and an H.264
pipeline; the `main.ts` re-entrancy refactor; the balance simulator; accounts and any backend.

Two notes for whoever picks this up next:

- **A comparative share stat needs no backend.** Running a deterministic reference policy against the
  day's seed at load time gives every player the same number to compare against ("the reference
  engineer escalated 4 of 10") with zero infrastructure. An earlier draft specified a population
  median, which contradicted its own no-server constraint.
- **Additive catalog events still move the map** unless empty band positions are reserved in the
  layout at authoring time. Inserting a heavier tool changer into a light-to-heavy ordering shifts
  every band after it, destroying the muscle memory the design asks players to build.

## Appendix: what a full version looks like

Recorded so the rescope does not lose the work, not as a commitment.

Roguelite runs of escalating waves, with an upgrade pool built under a **dead-card rule** — no upgrade
may be worthless to an expert, so every information effect needs a throughput face. A keystone in
which escalating a query permanently improves the *class* of spec it belongs to, making the safe
choice an investment. A standing cache whose poisoned entries bleed slowly rather than announcing
themselves. An inbox the player pulls from. A fixed-length daily as the front door, with the
roguelite as the depth mode behind it.

The economy must be re-solved as a set rather than patched locally, and the difficulty table must
count **cognitive** time — reading the spec — alongside motor actions. Earlier drafts undercounted the
action budget by roughly 1.5 to 2x by charging only for clicks.
