# Firebreak

A spike, and the reasoning behind it. Written after four rejected prototypes.

## The game

A bad fact ignites somewhere in the knowledge graph and spreads along the edges.
You drag through the strands to sever them before the fire reaches a root. You are
scored on how long you hold it.

One line of instruction, on screen at all times until the first drag:
**"Fire spreads along the strands. Drag through them to cut."**

No domain knowledge. Nothing to read. Fire is bad, and you already know how a
firebreak works.

## Why this and not the other seven

Two independent lines of work converged here. A panel of eight designers, each
working under the measured-topology constraints, produced eight concepts; a cull
and a headless simulation stage cut them to four; Firebreak came out top-two.
Separately, I reasoned my way to a chain-reaction concept, simulated it, and
watched it die — and the way it died pointed at containment.

That refutation matters more than the recommendation, so it is written down first.

### Spread-based scoring cannot work on this graph

Measured on the real `buildGraph(20260829, 1)`:

```
top node degrees:  431, 60, 60, 60, 59, 58, 57, 57
median degree:     3
nodes with degree >= 8:  60  (2.7% of the graph)

disc root (deg 431):   1 hop = 432 nodes    2 hop = 491
main root (deg 60):    2 hop = 1774         3 hop = 2216
typical leaf (deg 3):  2 hop = 25-61        3 hop = 76-95
```

Sixty nodes own all the reach. So any mechanic scored on *how far something
spreads* has one answer — the biggest visible hub — and that answer never changes.
I confirmed this by building three cascade variants and measuring them:

| model | result |
|---|---|
| global energy pool, charged nodes refund | 26x skilled/random, but only **27 of 2216** nodes are near-optimal and no human-runnable read finds them. "Click the brightest" scored **0%** of best; "click the biggest charged blob" scored **2-3%**. A lottery. |
| per-branch energy | Explodes. Refund above hop cost grows without bound; refund below it removes the chain reaction. No usable window. |
| fuel refill | Stable, legible, and degenerate: best click = **432 every single trial** at every charge density. That is the sunflower disc. One answer, forever. |

This is the same root cause that made Bloomrun tedious and that refuted Ignition
and Groundswell in round one. It is the degree distribution, not tuning.

### Containment does not have that problem

The player's input is an **edge**, so hub degree is a threat rather than a prize,
and the answer moves with the board. Measured, cutting a fire with a head start:

```
head start  cuts | perfect play saves  random play saves
    1         3   |        97.8%              0.9%
    2         3   |        38.6%              0.0%
    2         5   |        43.4%              0.0%
    3         5   |        12.3%              0.0%

optimal-cut overlap between different fire seeds:  0%
```

Zero overlap. The correct answer shares not one edge between boards, so there is
no memorised opening.

## The correction the panel's numbers need

The panel reported Firebreak at **146x** skilled-over-random and skilled play
saving 2192 of 2216 nodes. Both numbers are misleading, and I would not build to
them.

**The baseline is unfair.** Their "random" player cuts randomly among all 4,321
edges, which of course does nothing. I re-ran it with random restricted to the
*highlighted* strands around the fire — the only ones a real player can see or
click. Every policy then scored the same:

```
                     none   random-among-highlighted   smart   
nodes saved            0            2196                2196
```

Choosing *which* highlighted strand to cut is not a real decision. Cutting any of
them works about as well.

**And the ceiling is flat.** Their own spread is 2160 to 2194 out of 2216: a 1.5%
band. Everyone competent scores ~99%, so there is nothing to compete over. That is
the "no reason to replay" failure wearing a new coat.

## So it is a reflex game, and must be built as one

The honest reading of every measurement: on this topology containment is
**all-or-nothing**. Snuff an ember early and you lose almost nothing; miss one and
the small world takes the whole graph. There is no middle.

That is not a defect if the game is scored correctly. Fruit Ninja is a reflex
game and it is one of the most addictive things ever shipped. So:

- **Score is time survived, not percentage saved.** Unbounded range, natural ramp,
  directly comparable, obvious leaderboard.
- **Waves accelerate.** The gap between embers shrinks; you always lose eventually.
- **Losing is instant and legible.** The fire reaches a root, the graph is lost.
- **The skill is triage and speed**, not strand selection: which fire do you go to
  first when three are burning on opposite sides of the graph.

Survival time is genuinely sensitive to player speed. At a slow cadence the
simulated player lasted 70s; at a fast one it ran to the cap. That is a real skill
curve, and the ember acceleration is the single dial that sets difficulty.

## What the spike answers

Simulation cannot tell you whether a person can reliably slice the strand they
meant to, in 3D, under time pressure. That is exactly what killed the Pac-Man
attempt, so it is the only thing worth building first.

`firebreak.html` is that test and nothing more: the real graph, real fire on real
edge classes, a blade cursor, accelerating waves, and a clock.

## Tuning as built

```
fire travel:  webbing 1.1s   spoke 2.6s   root stem 6.0s
              travel tightens with time: x1.0 at the start, x0.55 by ~150s
first ember:  3.5s      gap starts 7.5s, x0.86 per ember, floor 0.55s
loss:         a hierarchy root ignites
camera:       static, wheel to zoom, near-imperceptible drift
unopposed:    the graph is lost in about 15s
```

Three decisions changed during the spike, each because building it exposed
something the design could not have known:

**The camera had to stop moving.** It first auto-framed the bounding sphere of the
live fire. That is wrong, and obviously so once you see it: dragging is slicing,
so a camera that chases the fire moves the target while you are aiming at it. It
sabotages the one thing this spike exists to measure. It is now static, and the
player trades context for precision with the wheel. Off-screen fires get an arrow
so zooming in can never hide a threat.

**Only hierarchy roots are fatal.** The long-tail disc's hub is also `kind === 2`,
and 430 leaves hang straight off it, so one ember in five was an unavoidable death
six seconds in with a single strand to cut. The disc now burns like anything else:
expensive, not fatal.

**Difficulty is the ember rate, not the fire speed.** The first tuning let a
450ms-per-swipe player survive indefinitely. Tightening the gap floor to 0.55s and
letting the fire itself quicken over the round brought every cadence back down to
a real death.

## Known risks

- **Targeting.** Webbing strands average 0.89 units against a ~100-unit field, so
  about 19px at the widest view. The auto-zoom exists to fix this and may not be
  enough. This is the thing to judge.
- **One swipe currently cuts about five strands.** Generous. If it feels too easy,
  narrow the blade before slowing the fire.
- **Watching a loss you cannot prevent is unpleasant.** Restart is one key.
- **Three roots, any one of which ends the round.** May want the two outer roots to
  be damage rather than death.
