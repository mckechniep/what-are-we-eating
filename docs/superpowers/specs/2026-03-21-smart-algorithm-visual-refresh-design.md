# Smart Algorithm + Visual Refresh — Design Spec

## Overview

Upgrade "What Are We Eating?" with a learning algorithm, fairness tracking, and a visual/UX refresh. The app stays a two-person, single-device tool for settling food decisions in Manhattan.

## Algorithm

### Preference Learning

Every decision updates a per-person weight map in localStorage.

**Scoring events:**
- Cuisine in active selection at decision time: +1 per cuisine per person
- Cuisine chosen as winner: +2
- Cuisine vetoed: -3

Scores are applied at decision time, not on individual tap/toggle events. Deselecting a cuisine has no effect on scores.

**Decay:** All scores decay by 10% per elapsed week. On each app load, calculate `weeksElapsed = floor((now - lastDecayTimestamp) / 604800000)`. If `weeksElapsed >= 1`, multiply all scores by `0.9 ^ weeksElapsed` and update the timestamp. Scores floor at 0.

**Storage shape:**
```json
{
  "preferences": {
    "YOU": { "italian": 12, "thai": 8 },
    "THEM": { "japanese": 15, "mexican": 4 }
  },
  "lastDecayTimestamp": 1742500000000
}
```

### Weighted Random Selection

Each candidate cuisine gets a composite score:

```
score = baseWeight × overlapBonus × recencyDecay × fairnessMultiplier
```

- **baseWeight**: `1 + yourPrefWeight + theirPrefWeight` (the 1 ensures unscored cuisines have a nonzero chance)
- **overlapBonus**: 2.0 if both people selected it, 1.0 otherwise
- **recencyDecay**: based on position in history — most recent pick = 0.0 (hard-excluded), 2nd last = 0.3, 3rd last = 0.6, 4th+ = 1.0. This replaces the old `AVOID_LAST_N = 3` hard-exclusion with a softer decay, but the most recent pick is still fully excluded to prevent immediate repeats.
- **fairnessMultiplier**: 1.0 when fairness is disabled or the cuisine is in both pools (overlap). When enabled and one person leads by 2+ wins: cuisines selected only by the trailing person get 1.5x; cuisines selected only by the leading person get 0.75x; overlap cuisines get 1.0x.

**Selection method:** Build a cumulative weight array from all scored candidates. Generate a random number in `[0, totalWeight)`. Linear scan to find the selected cuisine. This replaces all `Math.floor(Math.random() * array.length)` patterns.

**Empty selection edge case:** If neither person selects any cuisines, all cuisines compete equally with `baseWeight = 1`, modified only by recencyDecay. This is equivalent to a near-uniform random pick with repeat avoidance.

### Fairness Tracking (Toggle)

Track whose selection pool the final pick came from:
- If the chosen cuisine was in both pools (overlap): no one "wins"
- If it was only in YOUR pool: YOU gets +1 win
- If it was only in THEIR pool: THEM gets +1 win

**Multiplier logic:** When one person leads by 2+ wins, the `fairnessMultiplier` in the composite score adjusts per-cuisine:
- Cuisine selected only by trailing person: `fairnessMultiplier = 1.5`
- Cuisine selected only by leading person: `fairnessMultiplier = 0.75`
- Overlap or neither selected it: `fairnessMultiplier = 1.0`

This tilts odds without guaranteeing the outcome.

**Storage shape:**
```json
{
  "fairness": {
    "enabled": false,
    "wins": { "YOU": 7, "THEM": 12 }
  }
}
```

**UI:** A balance indicator on the selection screen showing the win ratio. Toggle on/off in a settings panel. Off by default.

### Veto Behavior

When the user vetoes a result:
1. Apply -3 to both persons' preference scores for the vetoed cuisine
2. Hard-exclude the vetoed cuisine from the immediate re-roll (in addition to normal recency exclusion)
3. Re-run `decide()` with the same active selections
4. The vetoed cuisine is added to history as normal (so recency decay applies to future rounds)

## UI/UX

### Architecture — Component Breakup

Split `App.jsx` (31KB) into focused components:

| Component | Responsibility |
|---|---|
| `App.jsx` | Top-level state, screen routing, localStorage sync |
| `SelectionScreen.jsx` | Two-person cuisine picker + filters + stats bar |
| `PersonPanel.jsx` | One person's cuisine button grid |
| `DecidingScreen.jsx` | Spinning emoji animation + API lookup status |
| `ResultScreen.jsx` | Winner display, restaurant card, order links, veto |
| `HistoryPanel.jsx` | Scrollable list of past decisions |
| `FavoritesManager.jsx` | Add/remove saved restaurants per cuisine |
| `SettingsPanel.jsx` | Fairness toggle, clear preferences, reset history |
| `StatsBar.jsx` | Fairness meter + preference insights |

### Styling

- Extract all inline styles to CSS modules (one `.module.css` per component)
- Global styles (keyframe animations, font imports, CSS reset) go in `src/global.css`, imported in `main.jsx`
- Define color tokens in a shared `src/tokens.css`: background, surface, pink (YOU), cyan (THEM), text levels
- Keep dark theme (#0c0c13 base), Bebas Neue headers, DM Sans body
- Consistent border-radius (12px cards, 20px chips), spacing scale
- Replace `setInterval` emoji spinner with CSS keyframe animation

### New Features

**Price filter:**
- Row of $ / $$ / $$$ / $$$$ toggle buttons on the selection screen
- Multi-select allowed (e.g., $ and $$ together)
- Passed to Yelp API as `price` parameter (comma-separated: "1,2")
- Persisted in localStorage

**Dietary filters:**
- Multi-select chips: Vegetarian, Vegan, Halal, Gluten-Free
- Appended to Yelp search term (e.g., "thai vegetarian restaurant")
- Persisted in localStorage

**Price and dietary filters with Claude fallback:** Filters are best-effort when using the AI fallback. Include them in the prompt text but filtering accuracy is not guaranteed. The result card should still show whatever the fallback returns.

**Restaurant photos:**
- Update `findRestaurantYelp` in `api.js` to include `imageUrl: pick.image_url` in return object
- Display as result card background with dark gradient overlay
- Fallback: solid dark surface with cuisine emoji if no image (also used for Claude fallback results)

**Stats/insights:**
- Small section on selection screen showing top 3 most-picked cuisines per person
- Fairness balance indicator (when enabled)
- "You've ordered Thai 8 times" style callouts

### Result Card Redesign

- Restaurant photo background with gradient overlay
- Restaurant name (large), neighborhood, star rating, price level, review count
- Cuisine emoji + label
- UberEats + DoorDash buttons as styled CTAs
- Fairness badge when applicable ("Their turn picked this one!")
- Veto and Start Over buttons

## Data Flow

1. User taps cuisines (toggles selections on/off — no scoring yet)
2. User hits "SETTLE THIS" → preference scores updated (+1 per active selection per person) → `decide()` runs weighted selection
3. Winner determined → preference scores updated (+2 for winner)
4. Restaurant lookup → `api.js` called with price/dietary filter params → Yelp API (with filters) → fallback to Claude (filters in prompt)
5. Result displayed → decision added to history in localStorage
6. If vetoed → preference score updated (-3 for vetoed cuisine) → vetoed cuisine hard-excluded → re-run from step 2

## API Layer Changes

Update `api.js`:
- `findRestaurantYelp`: accept `{ price, dietary }` filter params, pass `price` to Yelp query params, append dietary terms to search query, include `imageUrl` in return object
- `findRestaurantClaude`: accept same filter params, include them in the prompt text (best-effort)

## Storage

### Keys

Existing keys use the `wwe-` prefix. New keys follow the same convention for consistency.

| Key | Content |
|---|---|
| `wwe-history` | Array of past decisions (existing, unchanged) |
| `wwe-favorites` | Saved restaurants per cuisine (existing, unchanged) |
| `wwe-preferences` | Per-person preference weight maps (new) |
| `wwe-fairness` | Fairness toggle state + win counts (new) |
| `wwe-filters` | Price and dietary filter selections (new) |

### History Size Limit

History is capped at 100 entries. When a new entry would exceed the limit, the oldest entry is dropped (FIFO). This prevents unbounded localStorage growth. If `localStorage.setItem` throws `QuotaExceededError`, drop the oldest 10 history entries and retry. If it still fails, log a console warning — the decision still works, it just won't persist.

## Out of Scope

- Multi-device sync / accounts
- Location changes (stays Manhattan)
- Group support (3+ people)
- Native mobile app
