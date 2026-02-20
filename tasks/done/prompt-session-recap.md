# Prompt: Session Recap Screen — "Level Complete"

## Goal
Build a **Session Recap** screen that plays like a Vampire Survivors end-of-run results screen. When the user ends a session (or opens it from the START menu), they see all their stats tick up from zero with satisfying counters, staggered reveals, and a final grade. Numbers go up. Dopamine hits. It's the reward loop for shipping code.

## Inspiration
Think Vampire Survivors results screen, or any arcade "STAGE CLEAR" summary:
- Stats appear one at a time, staggered
- Numbers roll up from 0 to final value (not instant)
- Each stat has a label and a big number
- Sound plays as each counter ticks
- A final "grade" or "title" is revealed at the end with fanfare
- The whole thing takes ~6-8 seconds to play out, then the user can dismiss

## Data Sources (already exist in the codebase)

Pull stats from existing stores and systems:

| Stat | Source | Notes |
|------|--------|-------|
| **Commits Shipped** | `getTimeline()` from `history/timeline.ts` | Count commits since session start |
| **Files Changed** | Git diff stats from `deploy/git.ts` | Sum of files across all commits |
| **Lines Added** | Git diff `+` lines | The big green number |
| **Lines Deleted** | Git diff `-` lines | The big red number |
| **Time Elapsed** | Track session start time | Format as `Xh Ym` |
| **API Cost** | `terminalCost` store in `terminal.ts` | Format as `$X.XX` |
| **Prompts Fired** | Count of Claude Code invocations this session | May need a new counter store |
| **Auto-Fixes** | `autoFixAttempt` from `autoFix.ts` | Total attempts across session |
| **Screenshots Taken** | Count from screenshot flow | May need a new counter store |
| **Rerolls Used** | `rerollCount` from `prediction.ts` | Already tracked |

If a counter store doesn't exist yet (prompts fired, screenshots taken), add a simple writable counter to the appropriate store file. Increment it at the call site.

## New Screen

### `src/lib/screens/SessionRecapScreen.svelte`

**Screen type:** Add `'session_recap'` to the Screen union type in `src/lib/stores/app.ts`.

**Layout (left panel — where terminal normally is):**

The left panel becomes the stats display for this screen. Full dark background (`bg-[#0d1117]`).

**Header area:**
- Top: "SESSION COMPLETE" in Space Grotesk, 24px, primary color (`#0df2f2`), with a subtle glow text-shadow
- Below: session duration in smaller text, e.g., "1h 23m" in slate-400

**Stats grid — 2 columns, staggered reveal:**

Each stat is a card-like row:
- Left: stat label in uppercase, 10px, slate-500 (e.g., "COMMITS SHIPPED")
- Right: the number, 20px, bold, white — this is what ticks up
- Accent color per stat type:
  - Commits: primary cyan
  - Lines Added: `#3fb950` (GitHub green)
  - Lines Deleted: `#f85149` (GitHub red)
  - Cost: amber/yellow
  - Everything else: white

**Counter tick animation:**
- Each stat appears one at a time, 400ms stagger between stats
- When a stat appears, its number counts up from 0 to final value over 600ms
- Use easeOutExpo curve — fast start, slow finish (numbers go brrr then settle)
- Play `playNav()` SFX once when each stat row appears (not on every tick — too noisy)
- Use `requestAnimationFrame` for smooth counter animation, not setInterval

**Reveal order (top to bottom):**
1. Commits Shipped
2. Files Changed
3. Lines Added / Lines Deleted (these two appear together, side by side)
4. Prompts Fired
5. API Cost
6. Rerolls Used
7. Auto-Fixes Attempted
8. Screenshots Taken

**Final reveal — The Title:**
After all stats have ticked up (total ~5s), pause 800ms, then reveal a session "title" based on the stats. This is the punchline.

Title logic (pick the first matching condition):

| Condition | Title |
|-----------|-------|
| 0 commits, >5 prompts | "Professional Overthinker" |
| Lines deleted > lines added | "Digital Demolition Expert" |
| Auto-fixes > 3 | "Crash Test Dummy" |
| Cost > $5.00 | "Anthropic's Favorite Customer" |
| Commits > 10 | "Commit Machine" |
| Rerolls > 5 | "Indecisive but Thorough" |
| Screenshots > 5 | "Documentation Enthusiast" |
| Time > 4 hours | "Endurance Runner" |
| Lines added > 500 | "Code Volcano" |
| Default fallback | "Shipped It" |

Title appears with a different animation: scale up from 0.8 to 1.0 with a 300ms spring, primary color, larger font (18px), with `playSuccess()` SFX.

**Right panel (Action Palette):**

Standard ActionPalette with:
- Card 1 (selected): "Continue" — goes back to L1
- Card 2 (B): "New Session" — resets all session counters, goes to L1
- Card 3 (Y): "One More Run" — the ridiculous Y button. Same as Continue but plays a dramatic sound and the title text glitches for a second before navigating. Because Y is always ridiculous.

Hints: `[{ key: 'A', label: 'Continue' }, { key: 'B', label: 'New Session' }, { key: 'Y', label: 'One More Run' }]`

## The MTX Easter Egg

When the user has spent > $1.00 in API costs this session, add a tiny line below the cost stat (after it finishes ticking):

`"💎 Premium Vibes Unlocked"` — 8px, slate-600, barely visible. Does nothing. Means nothing. Just vibes.

If cost is $0.00 (demo mode or no API calls), show: `"F2P BTW"` in the same style.

This is the MTX. It's cosmetic only. As all MTX should be.

## Session Tracking

### `src/lib/stores/session.ts` (new file)

```
import { writable, get } from 'svelte/store';

export const sessionStartTime = writable<Date>(new Date());
export const sessionPromptCount = writable<number>(0);
export const sessionScreenshotCount = writable<number>(0);

export function resetSession(): void {
  sessionStartTime.set(new Date());
  sessionPromptCount.set(0);
  sessionScreenshotCount.set(0);
  // Also reset: rerollCount, terminalCost if appropriate
}

export function incrementPrompts(): void {
  sessionPromptCount.update(n => n + 1);
}

export function incrementScreenshots(): void {
  sessionScreenshotCount.update(n => n + 1);
}
```

### Increment call sites:
- `incrementPrompts()` — wherever `fireClaude()` or equivalent is called (AIWorkingScreen, or the Claude SDK integration layer)
- `incrementScreenshots()` — in the screenshot capture flow (wherever `screenshotPath` is set)

## Files to Modify

### 1. `src/lib/stores/app.ts`
- Add `'session_recap'` to the `Screen` type union

### 2. `src/lib/components/ScreenRouter.svelte`
- Add case for `'session_recap'` → renders `SessionRecapScreen`

### 3. `src/lib/input/inputRouter.ts`
- Add `session_recap` screen handlers: A = Continue, B = New Session, Y = One More Run

### 4. `src/lib/components/StartMenu.svelte`
- Add "Session Recap" option to the START menu so users can open it anytime

### 5. Call sites for new counters
- Increment `sessionPromptCount` at Claude invocation
- Increment `sessionScreenshotCount` at screenshot capture

## Design Rules
- **Numbers go up.** That's the whole point. The counter animation must feel satisfying — easeOutExpo, not linear.
- **Staggered, not instant.** Each stat reveals one at a time. The user watches the screen build up. Anticipation.
- **The title is the punchline.** Pause before it. Make it land.
- **Y is ridiculous.** "One More Run" should feel extra — glitch effect, dramatic pause, whatever. It does the same thing as Continue but with flair.
- **1280x800, no scroll.** All stats must fit. With 8 stats in 2 columns + header + title + padding, this should fit comfortably but verify.
- **The MTX joke is subtle.** Don't draw attention to it. It's funnier if the user discovers it.

## What NOT To Do
- Don't make this a modal or overlay — it's a full screen like every other screen.
- Don't auto-show it. It's accessed from START menu (and later could be triggered on project close).
- Don't persist session stats across app restarts. Session = current run only.
- Don't add actual microtransactions. (I can't believe I have to say this.)

## Verification
- Open from START menu → stats tick up with stagger animation
- Counter animation is smooth (requestAnimationFrame, not janky)
- SFX fires once per stat reveal
- Title appears after all stats with correct condition matching
- MTX easter egg shows for cost > $1, "F2P BTW" for $0
- Y button does something ridiculous
- All content fits 1280x800 without scroll
- "New Session" resets all counters
