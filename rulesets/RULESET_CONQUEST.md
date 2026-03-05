# 5D Risk with Multiverse Time Travel — Full Ruleset

## Overview

5D Risk with Multiverse Time Travel extends the classic game of global domination into a branching multiverse of alternate histories. Rather than per-unit movement budgets, each player receives two time-move opportunities per turn — one cross-timeline combat action and one cross-timeline non-combat move — reflecting Risk's unbounded spatial movement and unlimited attack structure. Every timeline is a fully playable alternate history. Victory requires dominance not just over one world, but across the multiverse.

---

## Game Mode Settings

| Setting | Options |
|---|---|
| **Adjacency Mode** | Strict / Loose |
| **Movement Mode** | Staged / Mixed |
| **Post-Hop Movement Limit** | Unlimited / Capped at N territories |
| **Card Scope** | Per-Timeline / Global Hand |
| **Victory Condition** | Total Control / Unique Territory Majority / Mission |
| **Fog of War** | Full Information / Current Turn Fog / Timeline Fog |

Recommended for first play: **Strict + Staged + Unlimited + Per-Timeline + Unique Territory Majority + Current Turn Fog**.

---

## 1. The Multiverse

### 1.1 Structure
- The game state is a collection of **timelines**, each containing a sequence of **timestates** (board states at a given turn number)
- Every timestate has a coordinate: `(Timeline ID, Turn Number)`
- The game begins with a single timeline (`TL0`) at turn 1
- New timelines are created only by time-travel moves; combat outcomes within a timeline do not create branches
- Timelines are assigned IDs sequentially in order of creation
- The **present** of a timeline is its most recently completed timestate
- A branch is always offset from its parent — it can never catch up

### 1.2 The Branch Tree
Timelines form a tree. Each timeline has exactly one parent (the timestate it branched from), except TL0. Lateral movement between timelines traverses edges of this tree; reaching a non-adjacent timeline requires passing through all intermediate ones.

### 1.3 The Column Rule
All timelines inherit the same turn order from their branching point. For any given turn number, the same player is taking their turn across every timeline that has reached that turn. Moving laterally between timelines at the same turn number means moving during your own turn on both boards.

---

## 2. Turn Order & The Sliding Window

### 2.1 Base Turn Order
Players take turns in a fixed sequential order (e.g. Player 1 → Player 2 → ... → Player N). This order never changes.

### 2.2 The Sliding Window
Time-travel moves do not create branches immediately. They are **committed** during a player's turn and **resolve** at the end of the governing sliding window.

Each pending branch has its own independent window. The window is always **n turns long** — exactly one full round.

- **Window opens** on the turn of the player who initiates the pending branch
- **Window duration**: every other player gets one turn in the window to optionally commit armies or actions to the same pending branch
- **Window closes** when it is the initiating player's next turn — n turns after opening
- **Crystallization**: the pending branch becomes a live timeline at that moment
- **First turn on the new timeline**: belongs to the player whose column the origin timestate was in — guaranteed by the column rule

The UI always shows the predicted crystallization point before a time move is committed.

### 2.3 n+0.5 Mode (Default)
Conquest uses the **n+0.5 window** by default. At the moment of crystallization — when it is the initiating player's next turn on the source board — the initiator receives a **constrained half-action** before the branch finalizes:

- They may commit additional armies from the same source territory they used when initiating the branch, up to the armies remaining there at the end of their initiating turn
- They may not use armies received at the start of their new turn
- This represents reinforcing the past just before history locks in, with full knowledge of who else arrived

After the half-action, the branch crystallizes and the origin column player takes the first full turn on the new timeline.

**Example (4 players: 1, 2, 3, 4; player 2 initiates at their turn in round 2, branching from player 3's column):**
```
Window opens: player 2's turn (round 2)
Window:       2 → 3 → 4 → 1 → [player 2's half-action, then crystallizes]
New timeline: player 3 takes the first turn
```

### 2.4 First-Turn Restriction
No time-travel moves are permitted during the first full round of the game (before every player has completed their first turn). This ensures a past exists to branch into and that all crystallizations land cleanly with established history on the new timeline.

---

## 3. A Turn

Each player's turn on a given board:

1. **Receive Armies** — calculate armies earned from territory count, continent bonuses, and any card set turned in
2. **Place Armies** — place all received armies in any controlled territories on this board
3. **Attack Phase** — attack any number of times as normal; optionally make one **time attack** (see 5.2)
4. **Fortify Phase** — make one normal fortify move; optionally make one **time move** (see 5.3)
5. **Draw Card** — if at least one territory was captured this turn on this board, draw one card from this timeline's deck

A player with turns on multiple boards this global turn may resolve them in any self-chosen order, seeing results from earlier boards before deciding on later ones.

---

## 4. Armies

Risk uses a single unit type: **armies**. All armies are identical regardless of which player controls them or which timeline they exist in. There are no unit subtypes, movement values, or special combat abilities.

---

## 5. Time-Space Movement

### 5.1 Two Time-Move Opportunities Per Turn
Unlike Axis & Allies where each unit has its own movement budget, Risk grants two time-specific actions per turn per board:
- One **time attack** during the attack phase
- One **time move** during the fortify phase

These replace the per-unit movement model. Normal Risk attacks and fortify remain available in addition to the time-specific actions.

### 5.2 Time Attack (Attack Phase)
Once per turn, in addition to any normal attacks, a player may declare a **time attack**:

- **Source**: any territory the player controls in the current timeline with 2 or more armies
- **Target**: the **same territory by name** in an adjacent timeline (one step in the branch tree), not currently controlled by the attacker in that timeline
- **Combat**: resolved using standard Risk dice (see Section 8)
- **Branch trigger**: if any defending armies are removed as a result of the attack, the history of the destination timeline has been modified — a pending branch is created in that timeline per its current sliding window. If the attacker takes losses but the defender loses none, no history is modified and no branch is created.
- **Attacker armies**: only armies from the source territory participate; they do not physically move to the destination timeline (this is an attack across the timeline boundary, not a movement)
- **If the attacker wins the territory**: the territory is captured in the pending branch. The attacker may move armies in to occupy it when the branch resolves, as with a normal capture, up to the number of dice they rolled with minus one.

### 5.3 Time Move (Fortify Phase)
Once per turn, in addition to the normal fortify, a player may make one **time move**. This consists of a single dimensional hop followed by normal spatial movement:

**Temporal move**: armies from any controlled territory move to a past timestate of the current timeline. The armies are committed and locked (see 5.7). A pending branch is created per the current timeline's sliding window.

**Lateral move**: armies from any controlled territory move to the same territory (by name) in the present of an adjacent timeline (same turn number — the column rule guarantees it is the player's turn there). No branch is created. Armies are available normally on that board going forward.

After either hop, armies may continue moving spatially using standard Risk fortify rules — through any chain of connected, friendly territories. If a Post-Hop Movement Limit is in effect, spatial movement after the hop is capped at N territories.

**A time move is either temporal or lateral, not both in a single action.**

### 5.4 Adjacency Mode

#### Strict Adjacency
Movement through or to a timestate is only permitted if that timestate has already been played in its timeline. You cannot move through or into any unplayed future timestate.

#### Loose Adjacency
You may traverse through or into unplayed future timestates. Special rules for non-existent (future) timestates:
- **Territorial control is ignored**: armies phase through as through a wormhole
- **No spatial movement is permitted in the future timestate**: armies pass through directly with no rerouting
- **Armies whose destination is a future timestate** are frozen on the pending board until that timeline's turn catches up. Since this move must be made during the fortify phase (the only legal time), when the destination timeline reaches that turn it is the sending player's turn (column rule). Armies materialize immediately at the **start of fortify** that turn and may complete their spatial movement normally. If the territory is now enemy-occupied, armies may not enter; they are lost (unlike A&A's mandatory combat, Risk does not allow fortify-phase combat).

### 5.5 Movement Mode

#### Staged Movement
The dimensional hop and spatial movement are distinct stages. The player chooses the order (hop first then spatial, or spatial first then hop). Stages may not be interleaved.

Consequence: the territory occupied during branch-tree traversal is the same fixed territory across all intermediate timelines. Territorial control is checked for that one territory in all intermediate timelines.

#### Mixed Movement
Spatial and dimensional hops may be freely interleaved. At each lateral step, the territory currently occupied is checked for control. Spatial rerouting through non-existent future timestates is not permitted even in mixed mode.

### 5.6 Territorial Control During Transit
At each step through an **existing** intermediate timeline, the territory currently occupied must be controlled by the moving player or unoccupied. Enemy occupation **blocks** the path. No combat occurs during transit; the player must choose a different route.

Non-existent future timestates (Loose Adjacency only) skip this check entirely.

### 5.7 No History Modification on Transit
Armies passing through an intermediate timeline without stopping do not modify that timeline's history. No branch is triggered. Armies that do not end their move in an intermediate timeline leave no trace. Territory is not captured during transit.

### 5.8 Locking — Committing to a Past Timestate
Armies that end their time move at a past timestate are **locked**:
- Removed from the origin board immediately
- Exist in the pending branch of the governing timeline
- Cannot receive orders until the sliding window resolves and the player's turn arrives in the new timeline

### 5.9 Post-Hop Movement Limit (Optional)
If this setting is enabled, armies may move at most N territories spatially after a time hop. This prevents time moves from functioning as teleportation across an entire continent. Recommended values: 3–5 territories. In unlimited mode, standard Risk fortify movement applies (any connected chain of friendly territories).

---

## 6. Branch Creation & Resolution

### 6.1 When Branches Form
| Action | Governing Window | Branch Created? |
|---|---|---|
| Time attack that removes defender armies | Destination timeline's window | Yes |
| Temporal time move (armies to past) | Current timeline's window | Yes |
| Lateral time move to present | — | No |

Multiple commitments to the same `(timeline, turn number)` destination during the same governing window bundle into a **single new branch**. Armies from any player may share a pending branch destination.

### 6.2 Resolution
When the governing window closes (initiator's next turn, after any half-action):
1. All armies committed to the same destination are collected
2. A new timeline is created from that destination timestate with those armies added
3. The new timeline receives the next available timeline ID
4. The new timeline begins accepting turns immediately; the first turn belongs to the player whose column the origin timestate was in

### 6.3 Pending Branch Visualization
When a pending branch exists, the game displays a **pending board** showing the destination timestate with all committed armies present, visually distinguished (e.g. colored outline, reduced opacity) from resolved timelines. When the window resolves the pending board becomes a full timeline.

---

## 7. Execution Order & Information

### 7.1 Global Reference Window
Turns across all active boards on a given global turn are executed **sequentially**, ordered by a **global reference window** — a simple rotating priority order across all n players, independent of any individual timeline's crystallization schedule.

Each global turn has a **global first player**. Execution proceeds:
1. Global first player resolves all their active boards in any self-chosen order
2. Next player resolves all their active boards
3. Continues until all players with active boards have resolved them
4. Global window position advances by 1 for the next global turn

When two players both commit armies to the same past timestate on the same global turn, the player whose batch resolved first is considered to have arrived first.

### 7.2 Crystallization Is Per-Branch
Each pending branch has its own independent window and crystallizes independently. The global reference window governs execution ordering only — not crystallization.

### 7.3 Multi-Board Turns
A player resolves all their active boards during their batch in any self-chosen order, seeing results from earlier boards before deciding on later ones.

### 7.4 Base Visibility Rules
These apply regardless of fog setting.

**Present boards**: All players see present board states after each player's batch completes. After a batch, others may observe that armies are missing from a present board but receive no information about why — they cannot distinguish between armies lost in combat, committed to a past timestate, or moved laterally.

**Pending/past boards — not a party**: Players who have not committed armies there see only the **historical view** — the unmodified state of that timestate before any time-travelers arrived. This does not update as others commit during the current global turn.

**Pending/past boards — party**: Players with armies already committed see the **current pending view** — the historical state plus all armies committed so far and any combat resolved. A player discovers the current pending state at the moment they commit — they commit based on historical information and see the actual state on arrival.

**Spectating players** (no active boards this global turn): See nothing in real time. After all batches complete, updated present board states are revealed. Pending boards follow party/non-party rules.

### 7.5 Fog of War Setting

**Full Information**: No restrictions beyond base visibility. All board states and pending states visible to all players in real time.

**Current Turn Fog** *(recommended default)*: Players cannot observe other players' active board moves during their batch. Each player sees the state left by the previous completed batch. Pending boards follow party/non-party rules.

**Timeline Fog**: As Current Turn Fog, plus non-party pending/past boards show only historical view at all times — even after all batches complete. Only present boards of your active timelines are fully visible.

### 7.6 Lateral Present Transfer — Phase Sync
When moving armies between parallel present timelines (same turn number, column rule guarantees it is your turn on both boards), both boards must be in the **fortify phase**. A player sequencing multi-board turns may order their boards to ensure phases align before transferring.

### 7.7 Pending Boards (UI)
When armies commit to a past timestate, a **pending board** is created for visualization — showing the historical state of that timestate with committed armies overlaid, visually distinguished from resolved timelines (colored outline, reduced opacity). Combat resolved on the pending board appears in the current pending view (parties only, subject to fog setting). When the governing window resolves, the pending board becomes a full timeline.

---

## 8. Combat

### 8.1 Standard Risk Dice
All combat — including time attacks — uses standard Risk dice:
- **Attacker** rolls 1–3 dice, maximum = min(attacking armies, 3). Must keep at least 1 army in the source territory.
- **Defender** rolls 1–2 dice, maximum = min(defending armies, 2)
- Compare highest attacker die vs highest defender die: attacker strictly greater → defender loses 1 army; otherwise attacker loses 1 army
- If both sides rolled 2+ dice: compare second-highest pair by the same rule
- Ties go to the defender

### 8.2 Time Attack Combat
A time attack uses the same dice rules. The attacker may roll multiple rounds, continuing or stopping as in a normal attack. The attacker's armies remain in the source territory throughout — they do not advance to the destination timeline even if the territory is captured. A pending branch is created as soon as any defending army is removed.

### 8.3 Capturing a Territory via Time Attack
If the attacker eliminates all defending armies in the target territory via a time attack, the territory is captured in the **pending branch** (not in the current destination timeline — TL1 is unaffected). When the branch resolves, the attacker may move armies into the captured territory. The number of armies moved must be at least equal to the number of dice rolled in the final attack round, and at most all armies that participated.

### 8.4 Defender Auto-Resolution
The defender's dice are rolled automatically by the game system; the defending player does not need to be present. The defending player sees combat results on their next turn on that board.

---

## 9. Army Placement

### 9.1 Armies Received Per Turn
At the start of each turn on a given board, the player receives armies equal to:
- `max(3, floor(territories controlled in this timeline / 3))`
- Plus continent bonuses for any continents fully controlled in this timeline
- Plus armies from any card sets turned in this turn

### 9.2 Per-Timeline Isolation
Army counts, territories, and card decks are tracked independently per timeline. You cannot transfer army receipts between timelines. A timeline where you are losing becomes progressively harder to sustain as your territory count drops.

---

## 10. Cards

### 10.1 Drawing Cards
Draw one card at the end of your turn if you captured at least one territory on that board this turn. Cards are drawn from that timeline's deck.

### 10.2 Card Scope Setting

**Per-Timeline**: Each timeline has its own card hand. Cards drawn in TL0 may only be turned in on TL0 turns. Simpler; most faithful to base Risk.

**Global Hand**: All cards drawn across all timelines go into one shared hand. Cards may be turned in on any timeline's turn. More complex; rewards multi-timeline activity with faster card set accumulation, which in turn accelerates army bonuses across all timelines.

### 10.3 Card Sets
Turn in a matching set of 3 during your receive-armies phase for a bonus:
- Three of the same symbol (infantry / cavalry / artillery), or one of each
- Set values increase with each trade: 4, 6, 8, 10, 12, 15, then +5 per trade thereafter
- If you eliminate a player, you take all their cards (of the same scope — their per-timeline hand, or their share of the global hand)

---

## 11. Victory

Territories are counted **uniquely by name** across all active timelines. Controlling France in TL0 and TL1 counts as one unique territory, not two.

### Mode A — Total Control
Control every territory across all active timelines. Extremely difficult; requires eliminating all opponents from every branch. Closest to standard Risk's elimination condition.

### Mode B — Unique Territory Majority *(recommended)*
Win by controlling a majority of unique territories across all active timelines, with a margin of at least 2 over the closest opponent. Rewards breadth of control across the map rather than timeline duplication. Directly extends 5D Diplomacy's supply center majority condition to Risk's territory model.

### Mode C — Mission
Each player is secretly assigned a mission card at game start (e.g. "Control all of Asia and South America", "Eliminate the player with the blue armies"). Missions are evaluated across all active timelines — the mission must be satisfied in every active timeline to win. If a player's elimination target is eliminated, the mission-holder wins immediately.

---

## 12. Key Differences from 5D Axis & Allies

| | 5D Axis & Allies | 5D Risk |
|---|---|---|
| Time-move budget | Per unit, shared spatial/temporal pool | Two fixed actions per turn (1 combat, 1 move) |
| Unit types | Many (infantry, tank, fighter, sub, etc.) | One (armies) |
| Combat | Dice, auto-resolved defender | Dice, auto-resolved defender |
| Present-to-present attack | Not a special mechanic | Time attack creates a branch if any hits land |
| Economy | IPC per territory, isolated per timeline | Armies per territory count, isolated per timeline |
| Lateral transit cost | 1 movement per branch-tree step | 1 of 2 time actions (covers the whole trip) |

---

## 13. Design Principles

- **Branches are player-driven**: Only deliberate time-travel moves create new timelines. Dice outcomes and territory captures within a timeline do not.
- **Two actions, not infinite budget**: The fixed action economy prevents timeline explosion while preserving Risk's characteristic freedom to attack anywhere on the board.
- **Transit leaves no trace**: Passing through an intermediate timeline without stopping modifies no history and triggers no branch.
- **Isolation sustains drama**: Per-timeline armies and cards mean a losing timeline collapses on its own without needing an explicit elimination rule.
- **The window distributes advantage**: The n+1 rotation ensures no player permanently holds first or last position in time-travel declaration order.
