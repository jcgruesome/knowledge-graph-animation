# Game concept panel — recommendation

Date: 2026-08-29
Method: ten designers ideated from distinct genre lenses (20 concepts), merged to 9 distinct
concepts, each judged on four lenses (fun, ten-second pick-up, brand/graph fit, buildability
against the code) plus an adversarial refuter. A lead-designer agent wrote the synthesis.

## Ranking (avg of four judges; "fatal" = the refuter found a concept-killing flaw)

| Concept | Avg | Refutation |
| --- | --- | --- |
| Ignition (one-tap chain reaction) | 7.1 | fatal — root feedback loop makes every run a fizzle or a blowout; rescuable |
| Groundswell (territory spread vs magenta) | 7.0 | fatal — whole graph floods in ~2s from any seed |
| **Bloomrun (comet over the flower shell, bloom = combo)** | **7.0** | **survived** |
| GRAZE (fly close, don't touch) | 7.0 | fatal — touch-or-die on blurred dots with no depth cue reads as random |
| Ground Truth (slingshot into the dandelion) | 6.9 | fatal — the shot curves in depth you cannot see |
| Ground Control (Missile Command with buds) | 6.8 | fatal — depth guess from a flat view; Pac-Man again |
| Critical Mass (Agar.io on the shell) | 6.8 | fatal — you outweigh everything in 25s |
| Groundwire (re-ground drifting flowers) | 6.8 | fatal — anchoring to the root is always safest |
| Tether (scoop and bank, hunters on rails) | 6.3 | fatal — hunters and your thread never actually meet |

## Synthesis (verbatim from the lead-designer agent)

# Recommendation: build Bloomrun

## 1. The pick

**Bloomrun.** You are a comet of light flying over a dark sky of grey flowers. Fly through one and it blooms petal by petal with a rising run of notes. Your tail is your streak: reach the next flower before the ring around you empties and the tail grows longer and brighter and each flower pays more. Dawdle and the world dims and the tail snaps to nothing. Ninety seconds, or until every flower is lit. Then the camera pulls back on the graph exactly as you lit it: score, longest streak, time.

First ten seconds: dark universe, one line ("Follow the mouse. Light the grey stars."), "click to start". Click: the inbound signal streaks in, the camera swoops behind a comet that shoots up the nearest spoke and lands on a flower, which blooms under you: plucks, "+41". The comet is already drifting toward your mouse; a grey flower sits two seconds away. You touch it at about seven seconds: bloom, "x2", brighter tail. No more text, ever.

## 2. Why this one

The only one of nine whose adversarial refutation was not fatal. Judges: fun 6.5, pick-up 7.5, fit 8, build 6, average 7.0.

Zero domain knowledge: no label is ever read; a hub is a target by position and size.

The universe is the game: the trail is the score readout, the bloom is the reward, haze and grain going grey is the streak running out, the camera chases and pulls back, sound climbs with the streak.

Star topology helps: you never travel an edge. Hubs are spaced points on a shell with guaranteed gaps; because leaves attach only to hubs, one touch blooms one clean unit. What killed Pac-Man cannot happen here.

One-more-go: a dropped streak is visible and yours ("one flower away"). Same layout for everyone each day, and the link you send carries the ghost of your run, so the next player races you.

The refutation's hit: the pitch says the bloom itself is the timer, but in the code every flower blooms in about one second regardless of size, and the next hub is two to three seconds away. As written the streak drops every time. The fix is small: the timer becomes a ring around the comet that empties over about three seconds; the bloom stays the payoff. We also take the judges' cuts: one objective (time to light everything), streak feeds speed, touching an already-lit hub refills the ring so the sparse endgame is not a guaranteed drop, and the yellow bounty and on-beat bonuses go.

## 3. Grafts from runners-up

- **Ignition:** root fog brightens as more is lit (progress with no counter); the "one answer leaves" finale fires only above 90% lit, quiet fade otherwise.
- **Critical Mass:** the camera its build review specified (locked behind the body, no flipping at the poles), the far-side fade so distant flowers do not bleed through near ones, and a faint ring on each hub so it reads as the target, not its petals.
- **GRAZE:** steering inert until the first mouse movement, so the cursor's load position cannot fling the comet.
- **Tether:** share card says "Verified 1,842", not "score".

## 4. The runner-up

**Ignition**: three sparks thrown into flowers; each bloom sends a wave that lights neighbours, which light theirs. Highest average (7.1). Fatal as pitched: the root feeds back on itself, so every run is a fizzle at 20-60% or a blowout at 95%+. Rescuable by removing the runaway (fixed heartbeat reach, bridges fire from any lit endpoint) and scoring hubs lit rather than percent. Choose it if the Bloomrun prototype fails: it has no steering and no moving camera, the click-only fallback.

## 5. Bury

- **Groundswell:** the whole graph floods in about two seconds from any seed; the 60-second race cannot exist here.
- **GRAZE:** the touch-and-die boundary is a few pixels on blurred dots with no depth cue; deaths read as random.
- **Ground Truth:** the shot flies into the screen, so every curve happens in depth you cannot see; the preview that fixes that solves the shot for you.
- **Ground Control:** the only decision is which fixed bud is nearest a mote's path, a depth guess from a flat view; Pac-Man again.
- **Critical Mass:** you outweigh every flower within 25 seconds; the one rule stops applying for two thirds of the run.
- **Groundwire:** anchoring to the root is always safest, so the chain layer never appears; what remains is click-the-dim-thing.
- **Tether:** hunters ride spokes inboard of the hub, your thread runs outboard; they only ever meet at the hub you just banked at, so the threat does not exist.

## 6. Prove it in a day

Throwaway build in a separate entry file: freeze the loop clock, load the graph dormant, comet sprite on the trail layer, cursor-follow with momentum over a smoothed shell height, camera locked behind it, touches on the 58 hubs by angle. On touch, run the existing ignition ramp through the hub and its leaves in petal order with the existing pluck per leaf, refill the ring, lengthen the trail. No motes, bounty, ghosts, share card, or end shot. Hand it to someone on a trackpad who has not seen it.

The one question: does flying the comet and chaining three hubs feel crisp on a trackpad, or like swimming? Crisp means everything else is production. Swimming means switch to Ignition.
