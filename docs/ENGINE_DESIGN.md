# 5D Multiverse Engine — Design Specification

## Purpose

This document defines the architecture of the game-agnostic 5D multiverse engine before implementation. It captures turn ordering models, conflict handling, branch mechanics, the plugin contract, and future directions. All implementation decisions flow from this spec.

---

## Core Concepts

### The 5D Address

Every piece and every board state in the game lives at a coordinate:

```
(Timeline ID, Turn Number, Region ID)
```

- **Timeline ID** — which branch of the multiverse
- **Turn Number** — which turn within that timeline
- **Region ID** — which territory, hex, or sea zone on the map

A *board* is the full state of one timeline at one turn: `(Timeline ID, Turn Number)`. A *location* is the full 5D address of a piece.

### Timelines and Branches

The game begins with a single root timeline. New timelines are created exclusively by player actions — never by dice outcomes or passive events. Timelines form a tree: each has exactly one parent except the root.

A **branch** is always offset from its parent. A child timeline starts at some past turn of the parent and can never catch up to it.

### The Column Rule

All timelines inherit the same player turn order from their branching point. For any given turn number, the same player is taking their turn across every timeline that has reached that turn. This guarantees that lateral moves between parallel present timelines always land on the moving player's own turn.

---

## Turn Ordering Models

The engine supports two fundamentally different models. Each game plugin declares which model it uses.

### Model A — Sequential with Rotating Priority

Players act one at a time. On each global turn:

1. The global first player resolves **all** of their active boards, in any self-chosen order
2. The next player in global order resolves all of theirs
3. This continues until all players with active boards have resolved
4. The global first player position rotates by one for the next global turn

A player sees the results of earlier boards within their own batch before deciding on later ones. They also see the state left by all players who acted before them this global turn.

Used by: 5D Colonist, 5D Conquest, 5D Theater of War.

### Model B — Simultaneous Secret Submission

All players submit all orders for all boards secretly and up-front. No player sees what others are doing until after all orders are submitted. Orders then enter a resolution phase.

The engine owns:
- The submission-collection phase (accepting orders, withholding visibility)
- The sequencing of order reveal

The plugin owns:
- The resolution logic (adjudication rules or ordered execution rules)
- What constitutes a legal order set

Used by: future 5D Warzone / 5D Diplomacy plugins.

---

## Conflict Handling

### The Key Principle: Prevention by Ordering

In Model A games, **conflicts are prevented, not resolved**. The sequential global execution order is the mechanism. When a player arrives at a pending board, all prior arrivals are already there. The arriving player sees the current state and must make legal moves given it. The game's own legality rules — not a separate conflict resolver — handle everything.

This holds across all three current games:
- **Colonist**: a player cannot place a settlement at an occupied vertex. The earlier arrival's structure is simply there. No conflict to adjudicate.
- **Theater of War**: enemy units are present on the pending board. Normal combat rules apply. Arrival order defines attacker vs. defender in ambiguous situations.
- **Conquest**: armies are present. Normal attack/fortify rules apply. The arrival order is the defined combat sequence.

There is no special "pending board conflict resolution" layer. The ordering creates defined game state; the plugin's normal legality rules enforce what is possible given that state.

### Dice Combat (Theater of War, Conquest)

When units meet in combat — on a present board or a pending board — resolution uses dice. The engine provides a reusable **dice infrastructure** component:

- Accepts attacker and defender unit sets (with stats provided by the plugin)
- Drives the round loop
- Auto-rolls for absent defenders (using standing orders or plugin-defined defaults)
- Supports three resolution modes (configured per game session):
  - **Manual** — player clicks through each round
  - **True Random** — engine simulates all rounds instantly with real RNG
  - **Balanced Blitz** — expected value resolves in one step

The plugin defines unit attack/defense values, special rules (first strike, AA fire, battleship two-hit), and casualty priority. The engine executes the loop.

### Strength Adjudication (future Diplomacy / Warzone plugins)

For simultaneous-submission games, the engine provides a reusable **strength adjudication** component:

- Accepts a full set of submitted orders across all boards
- Counts supporting orders to determine move strength
- Detects standoffs (equal strength)
- Returns resolved state deltas

The plugin defines what constitutes a valid order, what counts as support, and convoy rules.

### Path Blocking

In Model A games with unit movement (Theater of War, Conquest), an enemy-occupied territory blocks transit through it. The moving unit cannot take that route. No combat occurs. No branch is triggered. The engine's movement tools enforce this check at each step through existing intermediate timelines.

This is prevention, not resolution. The player must reroute or abandon the move.

---

## Branch Triggers

A pending branch is created when a committed action changes the history of a timestate. Plugins declare their branch trigger conditions. The three current trigger types are:

**1. Unit locks into a past timestate**
A unit commits to a past board. It is removed from its origin board immediately and placed in the pending branch. Used by Theater of War (temporal lock) and Conquest (temporal time move).

**2. Build action in a past timestate**
A structure is placed retroactively. No piece "travels" — the placement itself is the trigger. Used by Colonist (build time-move, robber time-move).

**3. Combat that modifies history**
A cross-timeline attack lands at least one hit on defenders. The act of removing a defending unit changes that timestate's history. If the attack lands no hits, history is unmodified and no branch is created. Used by Conquest (time attack).

A future Diplomacy/Warzone plugin would add:

**4. Adjudicated order that modifies history**
A submitted move order successfully resolves into a past timestate. The adjudication outcome determines whether history changed.

---

## Pending Branches

### Lifecycle

1. A branch trigger fires → engine creates a **pending branch** at `(Timeline ID, Turn Number)`
2. During the governing sliding window, further arrivals accumulate on the same pending branch (players see current pending state on arrival, subject to fog)
3. When the governing window closes → the pending branch **crystallizes** into a new live timeline
4. The new timeline begins accepting turns from the turn after its starting timestate

### Frozen vs. Live

Pending branches are fully frozen by default — no turns advance, no resources produce, no actions occur while pending. This is the default for Colonist and the baseline for all games.

Theater of War and Conquest may configure **limited-live** mode for pending branches (via the n+1 window's response turn), but full live advancement does not occur until crystallization.

### Arrival Policy

What happens when a player's units arrive at a pending board is a **per-game configurable setting**, because the right behavior depends on game balance and feel and requires playtesting:

- **`FULL_TURN_ON_ARRIVAL`** — the arriving unit/player expends their current turn on landing (the turn they were taking when they committed), then receives a normal turn when crystallization occurs
- **`FROZEN_UNTIL_CRYSTALLIZATION`** — the unit is inert until crystallization, then the player takes a full normal turn on the new timeline

### Multiple Arrivals

Multiple players may commit to the same pending branch during the same governing window. All see the current pending state at the moment they arrive (sequential ordering means earlier arrivals are visible). Global execution order defines who arrived first.

---

## Sliding Window

Each pending branch has its own independent sliding window, specific to that branch. The window is always **n turns long** — exactly one full round — regardless of which player initiates or which column the branch originated from.

### Window Lifecycle

**Opening**: The window opens on the turn of the player who initiates the pending branch (the player who commits the time-travel action).

**Duration**: The window runs for n turns — one full round. Every player gets exactly one turn in the window during which they may commit actions to the pending branch. The UI displays the predicted crystallization point (always knowable in advance) to aid planning.

**Crystallization (n model)**: When the window completes — i.e. when it is the initiating player's next turn — the pending branch crystallizes into a new live timeline with no further input from the initiator.

**Crystallization (n+0.5 model)**: At the same moment (the initiating player's next turn, on the initiating board), the initiator receives a **half-action** before crystallization fires. The engine:
- Does not advance the turn counter during the half-action (it is part of the prior turn)
- Restricts the half-action to the in-scope boards: the pending branch itself, and the initiator's source boards — only the boards that actually sent units or actions to initiate this branch, across all timelines the initiator acted in on that turn
- Invokes the plugin's action validator with `context.isHalfAction = true`

What actions are legal during the half-action is entirely the **plugin's responsibility**. The engine enforces only the board scope and the no-turn-advance rule.

The n+0.5 model gives the initiator both first-mover advantage (they define the branch) and last-look advantage (they see all other arrivals before adding their own), at the cost of resource constraint. This mirrors the strategic intent of the original n+1 window design, but without granting a free extra turn.

### Column Alignment Guarantee

After crystallization, the first full turn on the new timeline belongs to the player whose column the origin timestate was in (the player whose turn it was at the branched-from timestate). This is guaranteed automatically by the column rule: all timelines inherit the same turn order, so the first playable turn of TL_new is always the origin column player's turn.

Because the window closes on the initiator's turn (n turns = one full round), and the new timeline's first turn is the origin column player's turn, the UI can always display both the crystallization moment and the first-turn assignment before a time move is committed.

**Example** (4 players A, B, C, D; B initiates at B2, branching from C's column at C1):
```
Window:        B2 → C2 → D2 → A3 → [crystallizes at B3]
New board TL1: C takes first turn at C3
Source board:  B takes turn at B3, gets half-action (n+0.5) before TL1 crystallizes
```

### First-Turn Restriction

No time moves are permitted during the first full round of the game (before every player has completed their first turn). This ensures a past exists to branch into and that the first possible crystallization lands cleanly at the start of round 3, giving all players a full round of established history before TL1 enters play.

### Window Mode per Game

- **n (pure)**: Colonist default. No half-action for the initiator. Crystallizes cleanly when the window completes.
- **n+0.5**: Theater of War and Conquest default. Initiator gets a constrained half-action just before crystallization. Configurable — either mode available for any game.

---

## Information Model

### Party vs. Non-Party

A player is a **party** to a pending branch if they have committed actions there.

- **Party**: sees the current pending view — historical state plus all committed arrivals and resolved combat
- **Non-party**: sees only the historical view — the unmodified state of that timestate before any time-travelers arrived

A player discovers the current pending state at the moment they commit. They committed based on historical information; they see the actual state on arrival.

### Fog of War

Three settings, declared per game session:

- **Full Information**: all boards and pending states visible to all players in real time
- **Current Turn Fog** *(recommended default)*: players cannot observe other players' active board moves during their batch; each player sees the state left by the previous completed batch
- **Timeline Fog**: as Current Turn Fog, plus non-party pending/past boards always show only the historical view, even after all batches complete

---

## Plugin Contract

Each game plugin implements `IGameDefinition`, which wires together:

| Interface | Responsibility |
|---|---|
| `IMapLoader` | Loads the spatial graph (region nodes, adjacency, connection types) |
| `IUnitDefinition` | Unit types and properties (stats, move budget, special rules) |
| `ITurnStructure` | Declares named phases in order; which action types belong to which phase |
| `IActionValidator` | Which actions are legal this turn (calls engine movement tools) |
| `IActionEvaluator` | How actions resolve (calls engine dice/adjudication tools) |
| `IBranchTrigger` | Which committed actions create pending branches, and under what conditions |
| `IArrivalPolicy` | `FULL_TURN_ON_ARRIVAL` or `FROZEN_UNTIL_CRYSTALLIZATION` (configurable) |
| `IWinCondition` | How victory is evaluated across all active timelines |
| `IGameSettings` | Declares all configurable settings for this game and their defaults |

The plugin is the **wiring layer**. It calls engine tools with game-specific parameters. It does not reimplement dice rolling, branch-tree traversal, or sliding window logic.

### Engine Reusable Tools (plugins call these)

- **Dice roller**: round loop, RNG, balanced blitz mode, absent-defender auto-resolution
- **Strength adjudicator**: order submission, support counting, standoff detection
- **Movement resolver**: branch-tree traversal, intermediate control checks, step cost accounting, blocking detection
- **Turn phase sequencer**: enforces that actions only occur in valid phases
- **Pending board manager**: create, accumulate, crystallize

---

## Game-Specific Notes

### 5D Colonist

- Sliding window: **n-wide** (no response turn)
- Branch triggers: build time-move, robber time-move to past
- Pending branches: **fully frozen**
- No combat; conflict prevention only (ordering prevents illegal placements)
- Portal cost: configurable (default: 1 ore + 1 wheat, subject to playtesting)
- Lateral builds to present: configurable setting (default: Restricted)
- Arrival policy: configurable (frozen default; full-turn-on-arrival optional)

### 5D Conquest

- Sliding window: **n+1-wide**
- Branch triggers: time attack (only if defenders removed), temporal time move
- Combat: dice-based, three resolution modes
- Time attack target: **same territory only** OR **same + spatially adjacent** — configurable plugin setting, because Risk's movement model lacks the per-unit budget that would otherwise permit attacking an adjacent territory naturally; this setting exists to keep game pace high
- Post-time-attack continuation: **single attack only** (default) or **unlimited until you end phase** — configurable, as unlimited may prove unbalanced
- Cards: per-timeline or global hand — configurable
- Arrival policy: configurable

### 5D Theater of War

- Sliding window: **n+1-wide** (default); **n-wide** optional
- Branch triggers: temporal lock (unit commits to past timestate)
- Units use a shared spatial + temporal movement budget
- Lateral + temporal in a single move: **disallowed** (each move is purely spatial, purely temporal, or purely lateral)
- Combat: dice-based, three resolution modes, full A&A unit special rules
- Economies: isolated per timeline
- Arrival policy: configurable

---

## Future Work: CPU Opponents

Convincing four humans to play any of these games simultaneously is a meaningful barrier to playtesting and adoption. CPU opponents are a likely necessity for making the games playable at all.

### Approximate Opponent (Near Term)

A heuristic AI that:
- Plays legal moves only (engine enforces legality)
- Evaluates board states using a scoring function (territory count, army strength, VP total, IPC income, etc.)
- Makes time-travel decisions based on simple rules (e.g. branch when trailing, consolidate when leading)
- Does not perform deep tree search across the multiverse — too expensive without optimization

This is sufficient for solo play and playtesting. Difficulty tunable by adjusting lookahead depth and scoring weights.

### Stronger Opponent (Long Term)

A search-based AI using Monte Carlo Tree Search (MCTS) or similar, adapted to the multiverse structure:
- The game tree branches not just on moves but on timeline structure
- Uncertainty arises from dice (Theater of War, Conquest) and from other players' hidden intentions
- The sliding window bounds the horizon of relevant future states

Key challenges:
- State space is large and grows with each branch
- Simultaneous action resolution (in Model B games) requires imperfect-information search
- Multi-board turns mean the agent must reason about its own sequencing choices

### Plugin Responsibility

The AI is a game-specific concern. Each plugin provides:
- A board state evaluator (scoring function)
- A move generator that produces candidate actions for the AI to evaluate
- Difficulty presets (maps to search depth and heuristic aggressiveness)

The engine provides:
- Legal move enumeration (reuses `IActionValidator`)
- State transition simulation (reuses `IActionEvaluator`)
- The game loop interface the AI acts within (same interface as a human player)

A CPU opponent is, from the engine's perspective, just a player whose actions are generated programmatically rather than by a human sitting at a UI.

---

## What We Take from 5D Diplomacy (Inspiration Only)

- Coordinate system concept: (Timeline, Turn, Region) as the address space
- Adjudication pipeline pattern: validate → evaluate → execute
- Client board grid layout: timelines stacked vertically, turns horizontally
- Branch visualization with parent-child arrows
- Canvas rasterization for performance at many boards

## What We Build Differently

- Branch triggers: committed actions only, never state diffs
- Global execution order: rotating priority (not simultaneous submission as the only model)
- Pending branches: frozen by default, arrival policy configurable per game
- Plugin architecture: engine is game-agnostic from the start
- Per-timeline isolated economies
- Fog of war as a first-class engine feature
- Reusable tool components the plugins invoke rather than reimplementing
