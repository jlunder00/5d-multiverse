# 5D Axis & Allies with Multiverse Time Travel — Full Ruleset

## Overview

5D Axis & Allies with Multiverse Time Travel combines the grand strategy of Axis & Allies with time-travel mechanics. Players command their nations not just across the map but across a branching multiverse of alternate WWII histories. Units move through space and time using a shared movement budget. Time-travel moves create new branching timelines. Every timeline is a fully playable alternate history, and victory requires dominance across the multiverse.

---

## Game Mode Settings

Before play begins, agree on the following settings. Each is independent.

| Setting | Options |
|---|---|
| **Adjacency Mode** | Strict / Loose |
| **Movement Mode** | Staged / Mixed |
| **Victory Condition** | Classic Capture / Unique Capital Majority / Unique VC Majority / Timed |
| **Fog of War** | Full Information / Current Turn Fog / Timeline Fog |

These are described fully in their respective sections. Recommended for first play: **Strict + Staged + Unique VC Majority + Current Turn Fog**.

---

## 1. The Multiverse

### 1.1 Structure
- The game state is a collection of **timelines**, each containing a sequence of **timestates** (board states at a given turn number)
- Every timestate has a coordinate: `(Timeline ID, Turn Number)`
- The game begins with a single timeline (`TL0`) at turn 1
- New timelines are created only by time-travel moves; stochastic events such as combat outcomes never create branches
- Timelines are assigned IDs sequentially in the order they are created (`TL0`, `TL1`, `TL2`, ...)
- The **present** of a timeline is its most recently completed timestate
- A branch is always offset from its parent — it can never catch up

### 1.2 The Branch Tree
Timelines form a tree. Each timeline has exactly one parent (the timestate it branched from), except TL0 which is the root. Lateral movement between timelines traverses edges of this tree; to move between two non-adjacent timelines you must pass through all intermediate ones.

### 1.3 The Column Rule
All timelines inherit the same turn order from their branching point. Therefore: for any given turn number, the same player is taking their turn across every timeline that has reached that turn. Moving laterally between timelines at the same turn number means moving during your own turn on both boards.

---

## 2. Turn Order & The Sliding Window

### 2.1 Base Turn Order
Players take turns in a fixed sequential order within each timeline (e.g. Germany → USSR → UK → USA → Japan). This order never changes.

### 2.2 The Sliding Window
Time-travel moves do not create branches immediately. They are **committed** during a player's turn and **resolve** at the end of the governing sliding window.

Each pending branch has its own independent window. The window is always **n turns long** — exactly one full round.

- **Window opens** on the turn of the player who initiates the pending branch (commits units to a past timestate)
- **Window duration**: every other player gets one turn in the window to optionally commit their own units to the same pending branch
- **Window closes** when it is the initiating player's next turn — n turns after opening
- **First turn on the new timeline**: belongs to the player whose column the origin timestate was in — guaranteed by the column rule

The UI always shows the predicted crystallization point before a time move is committed.

### 2.3 n+0.5 Mode (Default)
Theater of War uses the **n+0.5 window** by default. At the moment of crystallization — when it is the initiating player's next turn on the source board — the initiator receives a **constrained half-action** before the branch finalizes:

- They may commit additional units from the board(s) they sent units from when initiating the branch, using only the remaining movement budget those units had at the end of the initiating turn
- They may not purchase new units or use movement from a fresh turn
- This represents reinforcing the past just before history locks in, with full knowledge of which other nations have also committed forces

After the half-action, the branch crystallizes and the origin column player takes the first full turn on the new timeline.

**Example (5 players: G, R, U, A, J; Germany initiates at their turn in round 2, branching from Russia's column):**
```
Window opens: Germany's turn (round 2)
Window:       G → R → U → A → J → [Germany's half-action, then crystallizes]
New timeline: Russia takes the first turn
```

### 2.4 Pure n Mode (Optional)
When configured as pure n (no half-action), the window closes and crystallizes immediately at the initiating player's next turn with no bonus. The origin column player then takes the first turn on the new timeline.

### 2.5 First-Turn Restriction
No time-travel moves are permitted during the first full round of the game (before every player has completed their first turn). This ensures a past exists to branch into and that all crystallizations land cleanly with established history on the new timeline.

---

## 3. A Turn

Each player's turn on a given board consists of the following phases in order:

1. **Purchase Units** — spend IPCs from this timeline's treasury to order units
2. **Combat Movement** — move units that will initiate combat (may include time-travel moves)
3. **Conduct Combat** — resolve all battles (see Section 8)
4. **Non-Combat Movement** — reposition units not involved in combat (may include time-travel moves)
5. **Place Purchased Units** — place ordered units at controlled industrial complexes
6. **Collect Income** — collect IPCs equal to the total IPC value of controlled territories in this timeline

Time-travel and lateral moves occur during movement phases (2 and 4). A unit may only act in one movement phase per turn.

---

## 4. Units & Movement

### 4.1 Unit Roster

**Land Units** (move between adjacent territories):
| Unit | Attack | Defense | Move | Cost | Notes |
|---|---|---|---|---|---|
| Infantry | 1 | 2 | 1 | 3 | Boosted to attack 2 when paired with artillery |
| Artillery | 2 | 2 | 1 | 4 | Boosts one paired infantry's attack to 2 |
| Tank | 3 | 3 | 2 | 6 | Can blitz |
| AA Gun | — | — | 1 | 5 | Fires at aircraft before combat; cannot attack |
| Industrial Complex | — | — | 0 | 15 | Production capped at territory IPC value |

**Air Units** (move across territories and sea zones freely; must land on friendly territory or carrier):
| Unit | Attack | Defense | Move | Cost | Notes |
|---|---|---|---|---|---|
| Fighter | 3 | 4 | 4 | 10 | Can land on carriers |
| Bomber | 4 | 1 | 6 | 12 | Cannot land on carriers |

**Naval Units** (move between adjacent sea zones):
| Unit | Attack | Defense | Move | Cost | Notes |
|---|---|---|---|---|---|
| Submarine | 2 | 1 | 2 | 6 | First strike; can submerge; immune to air without destroyer |
| Destroyer | 2 | 2 | 2 | 8 | Cancels submarine first strike |
| Cruiser | 3 | 3 | 2 | 12 | |
| Aircraft Carrier | 1 | 2 | 2 | 16 | Holds up to 2 fighters |
| Battleship | 4 | 4 | 2 | 20 | Takes 2 hits to sink |
| Transport | 0 | 1 | 2 | 7 | Carries land units; cannot attack |

### 4.2 Standard Movement Constraints
- Land units cannot cross sea zones without loading onto a transport
- Naval units cannot enter land territories
- Aircraft must be able to trace a path to a legal landing spot (friendly territory or carrier) within their total movement budget including any return path; aircraft that cannot land are lost
- Fighters may land on carriers that moved to their destination sea zone in the same turn
- Transported land units do not spend their own movement

### 4.3 Blitz
Tanks may move through an unoccupied or freshly captured enemy territory and continue moving with remaining movement. A tank that blitzes captures the territory immediately and may continue.

---

## 5. Time-Space Movement

### 5.1 Shared Movement Budget
A unit's movement budget applies uniformly across all dimensions — spatial, temporal, and lateral. Each step costs 1 movement:

- One territory or sea zone spatially
- One timestate backward in time
- One step laterally through the branch tree (to an adjacent parent or child timeline)

A unit with movement 6 could, for example, move 2 timestates back, cross 1 timeline, and move 3 territories spatially — any combination summing to ≤ 6.

### 5.2 Traversing the Branch Tree
To move between two non-adjacent timelines you must pass through all intermediate timelines along the branch tree path, spending 1 movement per step. You physically occupy a territory at each step; that territory must be under your control or unoccupied in the intermediate timeline (see 5.5).

### 5.3 Adjacency Mode

#### Strict Adjacency
Movement through or to a timestate is only permitted if that timestate has already been played in its timeline. You cannot move through or into any unplayed future timestate.

#### Loose Adjacency
You may traverse through or into unplayed future timestates of other timelines. The following special rules apply to any transit through a **non-existent (future) timestate**:
- **Territorial control is ignored**: the unit phases through as if through a wormhole; the state of those territories is unknown and cannot be checked
- **No spatial movement is permitted**: you may not make any spatial moves while in a non-existent timestate; you phase through directly to the next step
- **Units whose destination is a future timestate** are frozen — they exist on the pending board of the destination timeline, perpetually on the verge of arrival, until that timeline's turn counter reaches the committed timestate. Since this move must be declared during the combat movement phase (the only legal time for such a commitment), when the destination timeline catches up it is necessarily the sending player's turn (column rule). The unit resolves **immediately at the start of that turn** as a mandatory pre-phase before anything else:
  - **Enemy territory**: the unit must fight; it wins the territory or is destroyed. No retreat is possible.
  - **Unoccupied or friendly territory**: the unit moves in normally.
  - If the unit survives, the rest of that turn proceeds normally. Since the commitment was made during combat movement, non-combat movement remains available afterward.

### 5.4 Movement Mode

#### Staged Movement
Spatial and temporal/lateral movement are performed as two distinct stages within a move. The player chooses the order (all temporal/lateral first then all spatial, or all spatial first then all temporal/lateral). Stages may not be interleaved.

Consequence: the territory occupied during lateral transit is the same fixed territory across all intermediate timelines (either the origin or the spatial destination depending on chosen order). Territorial control is checked for that one territory across all intermediate timelines.

#### Mixed Movement
Spatial, temporal, and lateral steps may be freely interleaved in any order within a single move (e.g. move 1 territory → cross 2 timelines → move 3 territories).

The territory occupied at each lateral step is whatever territory the unit is currently in at that moment, which may differ across intermediate timelines. Territorial control is checked at each step in existing timelines.

**Spatial rerouting through non-existent futures is not permitted even in mixed mode.** Moving through a non-existent future is a pure lateral phase-through; no spatial moves may be made during it.

### 5.5 Territorial Control During Transit
At each lateral step through an **existing** intermediate timeline, the territory the unit currently occupies must be:
- Controlled by the moving player, or
- Unoccupied

If an enemy unit is present in that territory in the intermediate timeline, the path is **blocked**. The moving unit cannot take that route. No combat occurs, no branch is created, no history is modified.

In non-existent future timestates (Loose Adjacency only), this check is skipped entirely.

### 5.6 No History Modification on Transit
A unit passing through an intermediate timeline's timestate — moving spatially or laterally without stopping or engaging combat — does not modify that timeline's history. No branch is triggered. Other units in that timeline observe the unit appear and disappear, but their world continues unchanged. Territory is not captured during transit.

### 5.7 Locking — Committing to a Timestate
A unit becomes **locked** to a timestate when it either:
- **Ends its move** at a past timestate (in-timeline or in another timeline)
- **Engages in combat** at a past timestate during the combat movement phase

A locked unit:
- Is immediately removed from its origin board
- Exists in the **pending branch** (see Section 7.3) for the governing timeline
- Cannot receive any further orders until the sliding window resolves and creates a new timeline AND the player's turn comes around in that new timeline

Ending a move or engaging combat at a **present** timeline via lateral movement (Type 2) does not lock the unit — it is simply in that timeline's present and takes future turns there normally.

### 5.8 Lateral Present-to-Present Transfer — Phase Sync
When moving units between two parallel present timelines (the same turn number in two timelines — guaranteed to be the sending player's turn by the column rule), both boards must be in the **same movement phase**:
- Sending during combat movement → destination board must also be in combat movement
- Sending during non-combat movement → destination board must also be in non-combat movement

A unit's phase context is continuous across the transfer. You cannot use a lateral present-move to convert a combat-phase unit into a non-combat-phase unit or vice versa.

Since a player controls the order in which they take multi-board turns, they can deliberately sequence their boards to ensure phases are aligned before making a transfer — or deliberately sequence them to prevent a phase from aligning when they don't want to expose a board to lateral reinforcement.

### 5.9 Aircraft in Time-Space
Aircraft must be able to trace a path to a legal landing spot from wherever they end their move, through any combination of spatial, temporal, and lateral movement, within their remaining movement budget. If no such path exists within range, the aircraft is lost.

### 5.10 Transport in Time-Space
A transport may carry land units across any combination of dimensions. The transport pays the full movement cost; transported units do not spend their own movement.

### 5.11 Blitz Through Time
A tank blitzing through a past timestate in unoccupied or friendly territory may continue spending movement normally. Blitz captures do not apply during transit (territorial capture requires the unit to end its move or lock there).

---

## 6. Branch Creation & Resolution

### 6.1 When Branches Form
A branch forms when one or more units lock into a past timestate. The governing sliding window is:
- **In-timeline lock (Type 1)**: this timeline's current sliding window
- **Lateral lock into another timeline's past (Type 3)**: the destination timeline's current sliding window

Multiple units locked to the same `(timeline, turn number)` destination during the same governing window are bundled into a **single new branch**. Units from any nation may arrive in the same pending branch.

### 6.2 Resolution
When the governing window closes (initiating player's next turn, after any half-action):
1. All units locked to the same destination are collected
2. A new timeline is created from that destination timestate with those units present
3. The new timeline receives the next available timeline ID
4. The new timeline begins accepting turns immediately; the first turn belongs to the player whose column the origin timestate was in

### 6.3 Locked Units After Resolution
Once a branch resolves, locked units are now present on a real board. They receive orders normally on their player's next turn on that board.

---

## 7. Execution Order & Information

### 7.1 Global Reference Window
Turns across all active boards on a given global turn are executed **sequentially**. The order is determined by a **global reference window** — a simple rotating priority order across all n players, independent of any individual timeline's crystallization schedule.

Each global turn has a **global first player** — the player at the current position of the global reference window. Execution proceeds:

1. The global first player resolves **all** their active boards in any self-chosen order
2. The next player in global order resolves all their active boards
3. This continues until all players with active boards have resolved them
4. The global window position advances by 1 player for the next global turn

**Example (5 players: G, R, U, A, J):**
```
Global turn 1: G resolves all boards → R → U → A → J
Global turn 2: R resolves all boards → U → A → J → G
Global turn 3: U resolves all boards → A → J → G → R
```

This rotation ensures no player permanently holds first or last position in the global execution order.

### 7.2 Why Ordering Matters
When two players both commit units to the same past timestate on the same global turn, the player whose batch resolved first is considered to have arrived first. Their units are already on the pending board when the second player commits — the second player arrives into the updated pending state, not the historical state.

### 7.3 Multi-Board Turns
A player resolves all their active boards during their batch in any self-chosen order. They see the results of earlier boards within their own batch before deciding on later ones.

### 7.4 Crystallization Is Per-Branch
Each pending branch has its own independent window and crystallizes independently when its window closes. The global reference window governs **execution ordering only** — not crystallization. A pending branch may crystallize at any point, regardless of where the global order currently sits.

### 7.5 Base Visibility Rules
These rules apply regardless of the Fog of War setting.

**Present boards** (fully caught up to the current global turn):
- All players see the state of present boards after each player's batch completes
- After a player's batch, others may observe that units are missing from a present board — but receive no information about why. They cannot distinguish between units that died in combat, were committed to a past timestate, or moved laterally to another timeline.

**Pending/past boards — not a party**:
- Players who have not committed units to a pending board see only the **historical view**: the state of that timestate as it existed before any time-travelers modified it.
- The historical view does not update as other players commit units during the current global turn.

**Pending/past boards — party**:
- Players with units already committed to a pending board see the **current pending view**: the historical state plus all units currently committed there, and any combat already resolved on that board.
- When a player commits to a pending board for the first time, the current pending view is revealed to them at the moment of arrival — they committed based on historical information and discover the actual state on landing.

**Spectating players** (no active boards this global turn):
- See nothing in real time during the global turn regardless of fog setting.
- After all batches complete, updated present board states are revealed. Pending board states follow the party/non-party rules above.

### 7.6 Fog of War Setting

**Full Information**
No restrictions beyond the base visibility rules. All players may observe any board's current state in real time as turns resolve, including other players' active turns and all pending board states regardless of party status. Best for learning, analysis, or open play.

**Current Turn Fog** *(recommended default)*
Players cannot observe other players' active board moves while those players are executing their batch. Each player sees the state left by the previous player's completed batch — not what the current active player is doing. Pending board states still follow the party/non-party rules. After all batches complete, full present board states are revealed.

**Timeline Fog**
As Current Turn Fog, plus: players cannot observe any pending or past board state unless they have units committed there. Non-party pending boards show only the historical view at all times, even after all batches complete. Only the present boards of timelines you are active in are fully visible. The most realistic and competitive setting.

### 7.7 Pending Boards (UI)
When units are committed to a past timestate, a **pending board** is created immediately for visualization:
- Displays the historical state of the destination timestate with committed units overlaid
- Visually distinguished from resolved timelines (e.g. colored outline, reduced opacity)
- Multiple players' committed units to the same destination appear on the same pending board
- Combat resolved on the pending board is shown in the current pending view (visible to parties only, subject to fog setting)
- When the governing window resolves, the pending board becomes a full timeline with normal styling

---

## 8. Combat

### 8.1 Dice-Based Resolution
Combat uses standard Axis & Allies dice. Each unit rolls one d6 per combat round; a result less than or equal to the unit's attack (or defense) value scores a hit. Both sides roll simultaneously each round.

The **attacker** rolls their own dice. The **defender's** dice are rolled automatically by the game system — the defender does not need to be present. Casualty selection follows the defender's standing orders (Section 9). The defender sees all combat results on their next turn on that board.

### 8.2 Combat Sequence Per Round
1. AA gun fire (before first combat round only): each AA gun rolls one die per attacking aircraft; hits on a 1
2. Submarine first strike (if no opposing destroyer): submarines fire before all other units; their hits are assigned before the opponent fires back
3. All remaining units fire simultaneously
4. Casualties removed per standing orders
5. Check for retreat or elimination; repeat if neither

### 8.3 Special Unit Rules
- **Artillery + Infantry pairing**: Each artillery unit boosts one adjacent infantry's attack value from 1 to 2
- **Submarine — first strike**: Submarines fire before all other units at the start of each combat round. Their hits are assigned and casualties removed *before* the opponent rolls — meaning killed units never fire back. First strike is cancelled if the opposing side has a destroyer present; both sides then fire in the normal simultaneous round. Opposing submarines cancel each other's first strike symmetrically.
- **Submarine — submerge**: At the very start of any combat round, before any dice are rolled, a submarine may submerge. It sits out that round entirely — cannot be hit, cannot attack. It may resurface on a subsequent round or remain submerged. Submerge decisions are handled automatically by standing orders (see Section 9.4).
- **Submarine — aircraft immunity**: Submarines cannot be targeted by aircraft unless the attacking side has a destroyer present in the same sea zone. Air-only attacks cannot touch submarines.
- **Battleship**: Absorbs first hit without sinking; second hit sinks it
- **Transport**: Cannot attack; rolls defense of 1 if forced to fight

### 8.4 Retreat
The attacker may retreat after any combat round per their standing orders, moving surviving units back to the territory they attacked from. The defender may retreat only if standing orders permit it and a valid retreat destination exists.

---

## 9. Standing Orders

Each player configures standing orders executed automatically during combat. Updated during any turn; take effect for subsequent combats.

### 9.1 Casualty Priority
Order in which unit types are removed as casualties:
- Cheapest first (default)
- Most expensive first
- Custom order per unit type (e.g. infantry → artillery → tank → fighter)

### 9.2 Retreat Trigger
Conditions under which units retreat:
- Never retreat
- Retreat if attacker-to-defender ratio exceeds X after casualties
- Retreat if only unit types [configurable list] remain
- Retreat after round N of combat

### 9.3 Retreat Destination
When retreat triggers, units fall back to the nearest friendly territory or sea zone adjacent to the combat zone. If no legal retreat destination exists, retreating units are destroyed.

### 9.4 Submerge Trigger
Defines conditions under which submarines automatically submerge at the start of a combat round:
- Never submerge (fight to the end)
- Submerge if the only attacking units are aircraft (and no enemy destroyer is present — though this situation already grants immunity, so submerge is redundant; useful as a fallback)
- Submerge if this submarine is the last surviving unit in the sea zone
- Submerge after round N of combat
- Submerge if the enemy force outnumbers friendly by ratio X after casualties

Submerge decisions made by standing orders are executed before dice are rolled for that round, same as manual submerge.

---

## 10. Economy & Technology

### 10.1 Isolated Per-Timeline Economy
Each timeline maintains its own fully isolated IPC treasury. IPCs collected in a timeline may only be spent in that timeline. A timeline where a player is losing becomes resource-starved as their territory shrinks; losing timelines naturally collapse without an explicit elimination rule.

### 10.2 Isolated Per-Timeline Technology
Technology research is conducted within a single timeline and applies only there. A new branch inherits the tech state of the timestate it branched from; research conducted after the branch point does not propagate. Technology rules otherwise follow the base edition.

---

## 11. Victory

Victory is assessed across the entire active multiverse. Territories and capitals are always counted **uniquely by name** — controlling Paris in TL0 and TL1 counts as one unique location, not two.

### Mode A — Classic Capture
Win by controlling all required enemy capitals across **all active timelines simultaneously**. The Axis must hold their required Allied capitals in every timeline where those capitals exist; Allies must hold Berlin and Tokyo in every timeline. The hardest condition — requires total multiverse dominance.

### Mode B — Unique Capital Majority *(recommended starting point)*
Count unique capitals held by each side across all active timelines (by name). A side wins when they hold a majority of unique capitals with a margin of at least 2 over the opposing side. Directly extends 5D Diplomacy's supply center majority condition to capitals.

### Mode C — Unique Victory City Majority *(recommended default)*
Same as Mode B but using the full set of designated victory cities (typically 18 in standard editions). More granular and harder to dominate. Winning requires broad territorial control across the multiverse, not just capital camping.

### Mode D — Timed Unique VCs
After a agreed number of rounds, count unique VCs held across all active timelines. Most unique VCs wins. Suitable for fixed-length sessions.

---

## 12. Summary of Key Design Principles

- **Branches are player-driven**: Only deliberate time-travel moves create new timelines. Combat outcomes, dice rolls, and random events do not.
- **Movement is unified**: Spatial and temporal movement share one budget. Fast units are naturally better time-travelers.
- **Transit leaves no trace**: Passing through a timestate without stopping or fighting does not modify history and creates no branch.
- **Locking has a cost**: Committing a unit to the past removes it from play until the window resolves — a meaningful trade-off between presence now and influence then.
- **Economies are isolated**: Each timeline lives and dies on its own resources.
- **Information asymmetry is concurrent, not persistent**: Players know their own forces everywhere. Fog only covers what other players are doing at this exact moment on other boards.
- **Sequential turns are preserved**: The core A&A turn structure is unchanged. The sliding window is a layer on top.
- **The window distributes advantage**: Every player gets exactly one turn in every pending branch window. The initiator goes first (opens the branch) and in n+0.5 mode gets a constrained last look before crystallization — but cannot spend fresh resources, only what remained from their initiating turn.
