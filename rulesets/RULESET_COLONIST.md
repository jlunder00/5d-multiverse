# 5D Catan with Multiverse Time Travel — Full Ruleset

## Overview

5D Catan with Multiverse Time Travel extends the classic resource and building game into a branching multiverse of alternate histories. Each turn, players may spend resources to build not just on their current board but in the past of any timeline — creating new branches where that structure has always existed. The robber gains temporal and lateral mobility. Victory requires dominance across a living, growing multiverse while managing the economic consequences of your own branching decisions.

---

## Game Mode Settings

| Setting | Options |
|---|---|
| **Adjacency Mode** | Strict / Loose |
| **Portal Cost** | Fixed / Distance-Scaled |
| **Lateral Builds to Present** | Allowed / Restricted |
| **Fog of War** | Full Information / Current Turn Fog / Timeline Fog |
| **Victory Condition** | Race to 10 / End Trigger + Total / Per-Timeline Majority |

Recommended for first play: **Strict + Fixed + Restricted + Current Turn Fog + Race to 10**.

---

## 1. The Multiverse

### 1.1 Structure
- The game state is a collection of **timelines**, each containing a sequence of **timestates** (board states at a given turn number)
- Every timestate has a coordinate: `(Timeline ID, Turn Number)`
- The game begins with a single timeline (`TL0`) at turn 1, set up using standard Catan rules
- New timelines are created only by time-travel actions; dice outcomes and normal play never create branches
- Timelines are assigned IDs sequentially in order of creation
- The **present** of a timeline is its most recently completed timestate
- A branch is always offset from its parent — it can never catch up

### 1.2 The Branch Tree
Timelines form a tree. Each timeline has exactly one parent timestate it branched from, except TL0. To reach a non-adjacent timeline, you must traverse the tree — though in Catan, time-travel is a portal jump with no spatial traversal cost (see Section 5).

### 1.3 The Column Rule
All timelines inherit the same turn order from their branching point. For any given turn number, the same player is taking their turn across every timeline that has reached that turn. This guarantees that lateral moves between parallel present timelines always land on your own turn.

---

## 2. Turn Order & The Sliding Window

### 2.1 Base Turn Order
Players take turns in a fixed sequential order. This order never changes.

### 2.2 The Sliding Window
Time-travel actions do not create branches immediately. They are **committed** during a player's turn and **resolve** at the end of the governing sliding window.

Each pending branch has its own independent window, specific to that branch. The window is always **n turns long** — exactly one full round.

- **Window opens** on the turn of the player who initiates the pending branch
- **Window duration**: every other player gets one turn in the window to optionally commit their own time-travel actions to the same pending branch
- **Window closes** when it is the initiating player's next turn — n turns after opening
- **Crystallization**: the pending branch becomes a live timeline at that moment; no half-action bonus in Colonist (pure n model)
- **First turn on the new timeline**: belongs to the player whose column the origin timestate was in — guaranteed by the column rule

**Example (4 players: 1, 2, 3, 4; player 2 initiates a branch during their turn in round 2, branching from player 3's column):**
```
Window opens: player 2's turn (round 2)
Window:       2 → 3 → 4 → 1 → [crystallizes at player 2's next turn, round 3]
New timeline: player 3 takes the first turn
```

The UI always shows the predicted crystallization point before a time move is committed.

### 2.3 First-Turn Restriction
No time-travel actions are permitted during the first full round of the game (before every player has completed their first turn). This ensures a past exists to branch into and that all crystallizations land cleanly with established history on the new timeline.

---

## 3. A Turn

Each player's turn on a given board:

1. **(Optional) Play a development card** — knight must be played before rolling if used to trigger a robber time-move
2. **Roll dice** — produce resources or resolve robber (7)
3. **Collect resources** — all players collect from matching hexes; if 7 was rolled, move robber normally or use a robber time-move
4. **Trade** — maritime trades and player trades as normal (within this timeline only)
5. **Build** — build roads, settlements, cities, or buy development cards as normal; optionally take one time-travel action (see Section 5)

A player with active turns on multiple boards resolves them in any self-chosen order during their batch.

---

## 4. Pieces & Victory Points

| Piece | Cost | VP |
|---|---|---|
| Road | 1 wood + 1 brick | 0 |
| Settlement | 1 wood + 1 brick + 1 wheat + 1 sheep | 1 |
| City | 3 ore + 2 wheat | 2 (replaces settlement) |
| Development Card | 1 ore + 1 wheat + 1 sheep | varies |
| Longest Road | — | 2 (awarded per timeline) |
| Largest Army | — | 2 (awarded per timeline) |

VP is counted **per timeline**, not uniquely across timelines. A settlement at vertex V in TL0 and TL1 counts as 2 VP total (1 per timeline). Unique counting is not used because initial placement blocks roughly 2 vertices per opponent regardless of strategy, making unique VP ceilings asymmetric and placement-dependent.

---

## 5. Time-Travel Actions

### 5.1 One Action Per Turn
Each player may take **one time-travel action** per turn per board. This action is taken during the build phase (step 5). There are two types:

- **Build time-move** — available every turn
- **Robber time-move** — available only when a robber action is triggered (rolled 7 or played a knight card)

These are separate: a player who rolled 7 may take both a build time-move AND a robber time-move in the same turn.

### 5.2 Portal Cost
All time-travel actions require a **portal cost** paid from the current timeline's resources, in addition to any normal build costs.

**Fixed portal cost** (default): A set combination determined before the game begins. Suggested starting point: 1 ore + 1 wheat. Tune through playtesting.

**Distance-scaled portal cost** (optional): Base portal cost plus 1 additional resource per timeline step traversed in the branch tree, and/or 1 additional resource per timestate traveled backward.

### 5.3 Build Time-Move
Pay normal build cost + portal cost. Place a road, settlement, or city in a **past timestate** of any timeline. Standard Catan placement rules apply at the destination (road connectivity, settlement distance, etc.).

- No spatial distance restriction — the portal is instantaneous, no intermediate traversal cost
- The destination timestate must have already been played (Strict Adjacency) or may be unplayed (Loose Adjacency; see 5.7)
- A pending branch is created at the destination, governed by the destination timeline's current sliding window
- The placed structure exists in the pending branch from the branching point forward; it does not exist in the source or destination timeline itself (those continue unmodified)

**Lateral build to present** (configurable): If Allowed, a player may also pay portal cost to place a structure directly in the present of an adjacent parallel timeline (same turn number, column rule guarantees it is their turn there). No branch is created. The structure immediately exists in that timeline. If Restricted, builds may only target past timestates.

### 5.4 Robber Time-Move
When a robber action is triggered (rolled 7 or played a knight card), the player may choose a robber time-move instead of (or in addition to, if both are available) a normal robber move.

**Temporal robber move (bootstrap)**: The robber travels from the current timeline's present to a past timestate. A pending branch is created. The source timeline loses its robber immediately. The new branch receives exactly **one robber** — the traveler. No duplication occurs. The bootstrap principle: the robber was always destined to leave into this branch; in the source timeline it existed until the moment of departure, and in the branch it has always been at the destination from the branching point.

**Lateral robber move to present**: The robber moves to the present of an adjacent timeline. Source loses its robber. Destination gains one — it may now have two if it already had one. No branch is created.

**Lateral robber move to past**: The robber moves to a past timestate of an adjacent timeline. A pending branch is created. The source loses its robber. The new branch inherits the historical robber that existed at that timestate AND receives the traveling robber — **two robbers** in the new branch. Net effect: +1 robber across the multiverse.

### 5.5 Robber Proliferation
The number of robbers across the multiverse can grow:

- **Build time-moves**: Every new branch inherits the robber at its destination timestate. The source timeline keeps its own present robber. Net: +1 robber per branch created.
- **Lateral robber to past**: New branch gets 2 robbers. Net: +1 robber.
- **Temporal robber (bootstrap)**: Net: 0. The robber shifts, not duplicates.
- **Lateral robber to present**: Net: 0. The robber moves, not duplicates.

Multiple robbers in one timeline block multiple hexes simultaneously. This functions as a natural counter to building concentration — a timeline dense with settlements and cities is also a high-value target for robber proliferation, suppressing its production. The robber economy and the building economy check each other without requiring an explicit rule.

### 5.6 Multiple Robbers in One Timeline
All robbers in a timeline are active simultaneously. Each blocks its hex normally. When a robber move (normal or time-travel) is made from a timeline with multiple robbers, the player chooses which robber to move.

### 5.7 Adjacency Mode

**Strict Adjacency**: Time-travel actions may only target past timestates that have already been played in their timeline. Unplayed future timestates are unreachable.

**Loose Adjacency**: Time-travel actions may target unplayed future timestates of other timelines. Structures placed in a future timestate are frozen — the pending branch does not advance until that timeline's turn counter catches up. At the moment of catch-up, the structure simply exists as placed; normal production begins from that turn forward. Standard Catan rules must have been satisfiable for the placement at the time the future turn would have occurred (road connectivity, etc.); if they are not, the placement is invalid and the action is forfeit.

---

## 6. Pending Branches

### 6.1 Frozen State
Pending branches are **fully frozen**. No turns advance, no resources are produced, no actions are taken in a pending branch. It accumulates committed structures and robbers from all players who send time-travel actions to the same destination during the same governing window. When the window resolves, it crystallizes into a full timeline and turns begin advancing from the branching timestate forward.

**No back-production**: A settlement placed in turn 5 via a time-travel action does not collect the resources it "would have" produced during turns 6–12 while the branch was pending. Production starts fresh from crystallization.

The frozen state reflects the lore: the sliding window simulates the constraint that everyone who will ever attempt to travel to a given place and time arrives within moments of each other. The window bounds and orders those arrivals. The pending branch is the moment just before the timeline splits — a pocket of suspended causality where all travelers accumulate before history diverges.

### 6.2 Multiple Arrivals
Multiple players may commit time-travel actions to the same pending branch during the same window. All arrive simultaneously when the branch crystallizes. If multiple players placed structures at conflicting positions (e.g. both placed a settlement at the same vertex), resolve by global execution order — the player who committed first (earlier in the global order, see Section 7) has priority. The later player's placement is invalid; they forfeit that action but retain the resources spent (portal cost is not refunded — the portal was opened).

### 6.3 Visualization
When a time-travel action is committed, a **pending board** is created immediately:
- Shows the destination timestate's historical state with all committed structures overlaid
- Visually distinguished from resolved timelines (colored outline, reduced opacity)
- Only players who have committed to this pending branch see its current state (subject to fog setting)
- When the governing window resolves, the pending board becomes a full timeline with normal styling

---

## 7. Execution Order & Information

### 7.1 Global Reference Window
Turns across all active boards on a given global turn are executed **sequentially**, ordered by a **global reference window** — a rotating priority order across all n players, independent of any individual timeline's crystallization schedule.

Each global turn has a **global first player**. Execution:
1. Global first player resolves all their active boards in any self-chosen order
2. Next player resolves all theirs
3. Continues until all players with active boards have resolved
4. Global window position advances by 1 for the next global turn

The first player in the global order arrives first at any contested pending branch destination.

### 7.2 Crystallization Is Per-Timeline
Each timeline crystallizes its pending branches on its own n-wide window independently. The global reference window governs execution order only.

### 7.3 Base Visibility Rules

**Present boards**: All players see present board states after each player's batch completes. After a batch, others may observe that structures are missing or have appeared but receive no information about why — they cannot distinguish between a structure lost to the robber, built via a time-travel action in a branch, or built normally.

**Pending boards — not a party**: Players who have not committed to a pending branch see only the **historical view** — the unmodified state of that timestate. This does not update as others commit during the current global turn.

**Pending boards — party**: Players with actions committed to a pending branch see the **current pending view** — historical state plus all committed structures and robbers so far. A player discovers the current pending state at the moment they commit — they committed based on historical information and see the actual state on arrival.

**Spectating players** (no active boards this global turn): See nothing in real time. After all batches complete, updated present board states are revealed.

### 7.4 Fog of War Setting

**Full Information**: No restrictions. All board and pending states visible to all players in real time.

**Current Turn Fog** *(recommended default)*: Players cannot observe other players' active moves during their batch. Each player sees the state left by the previous completed batch. Pending boards follow party/non-party rules.

**Timeline Fog**: As Current Turn Fog, plus non-party pending boards always show only the historical view, even after all batches complete. Only present boards of your active timelines are fully visible.

---

## 8. Resources & Production

### 8.1 Isolated Per Timeline
Each timeline maintains its own fully isolated resource economy. Resources collected in a timeline may only be spent in that timeline (including portal costs for time-travel actions originating there). There is no transfer of resources between timelines.

### 8.2 Production
On each player's turn in a timeline, the dice are rolled and all players collect resources from matching hexes in that timeline, subject to the robber (any robber present in that timeline blocks its hex). Standard Catan production rules apply per timeline.

### 8.3 Trading
Trade (maritime and player-to-player) occurs within a single timeline only. Players may not trade resources across timelines.

---

## 9. Development Cards

Development cards are per-timeline. Each timeline has its own deck and draw pile. Effects apply within the timeline where the card is played, with the following time-travel exceptions:

- **Knight**: May trigger a robber time-move instead of a normal robber move (see 5.4). Contributes to Largest Army in the timeline where played.
- **Road Building**: Places 2 roads on the current timeline only. Roads may not be placed in other timelines via this card.
- **Year of Plenty**: Takes 2 resources from the current timeline's bank.
- **Monopoly**: Takes all of one resource type from all players in the current timeline only.
- **Victory Point cards**: Count toward VP in the timeline where held.

---

## 10. Victory

### Mode A — Race to 10 *(recommended)*
The first player to reach 10 VP on **any single timeline** wins immediately. VP is counted within that timeline only: settlements, cities, VP cards, Longest Road (2 VP), Largest Army (2 VP). Familiar, direct, and preserves the sprint feel of base Catan. The multiverse creates alternative paths to 10 VP — invest in a branch where your starting position is stronger, or use the branch to undo a bad early game.

### Mode B — End Trigger + Total
The first player to reach 10 VP on any single timeline **triggers the end of the game** but does not automatically win. At that point, count total VP across all active timelines for every player. The player with the highest total wins.

VP is counted additively across all timelines — a settlement at vertex V in TL0 and TL1 counts as 2 VP, not 1. Longest Road and Largest Army count per timeline where held. Creates tension between racing to trigger the end while ahead on total VP vs continuing to branch and accumulate.

### Mode C — Per-Timeline Majority
No global VP threshold. The game ends when the first timeline reaches 10 VP (by any player) or after a set number of global turns. The player who leads (has the most VP) in the most active timelines wins. Tiebreak: total VP across all timelines.

---

## 11. Design Principles

- **Branches are player-driven**: Only deliberate time-travel actions create new timelines. Dice rolls, production, and normal building never trigger branches.
- **One action per turn**: The fixed limit prevents exponential branching while preserving meaningful strategic choice each turn.
- **Pending branches are frozen**: No production accumulates while pending. Branching is investment in future timelines, not a way to retroactively collect resources.
- **N-wide window**: No response turn. The window distributes first-mover advantage fairly without granting extra build actions.
- **Portal cost limits time travel**: Resources are the universal limiter. Time-travel competes directly with normal building; every portal opened is production not spent on roads, settlements, or cities in the present.
- **Robbers counter building concentration**: Robber proliferation through branching suppresses dense timelines naturally. The robber economy and building economy are in tension without needing explicit rules to enforce it.
- **Economies are isolated**: Each timeline lives and dies on its own production. A timeline being strangled by robbers or cut off from expansion collapses naturally.
