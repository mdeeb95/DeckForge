# Prompt: Settings Menu Audit — Fix All Broken UX

## Context
The Settings menu has multiple UX bugs uncovered during a manual audit. Most trace back to one root cause: **cards are built once at module init using `const config = get(globalConfig)` — a non-reactive snapshot.** When the config changes (e.g. toggling cost indicator, cycling model), the card pills and descriptions never update because the `cards` array is a plain `const`, not a `$derived` reactive binding. The terminal log shows the change happened, but the card itself still displays the stale value.

Secondary issues: D-pad L/R is described on cards but never wired in the input router, the API key entry is a clunky full-screen keyboard, and some cards should be deleted entirely.

This prompt fixes everything in one pass. No new features — just making existing settings actually work.

---

## Issue 1: Action Cards Don't Reactively Update (ROOT CAUSE)

**Affected**: Every settings subscreen — `SettingsPredictionScreen`, `SettingsDisplayScreen`, `SettingsTelemetryScreen`, `SettingsAdvancedScreen`, and the hub `SettingsScreen`.

**Problem**: Each screen does this at module top level:
```ts
const config = get(globalConfig);   // ← snapshot, read once
const cards = [
  { pills: [{ label: config?.something }], ... },
];
```
This reads `globalConfig` once when the component mounts. After that, `cards` never changes, so ActionPalette and ActionCard always show stale pill values.

**Fix**: Convert `cards` from a `const` to a `$derived` reactive binding. Subscribe to the `globalConfig` store using `$globalConfig` (Svelte 5 rune syntax) so the cards array recomputes whenever config changes.

### Fix for `SettingsPredictionScreen.svelte`

Replace the static config read and cards definition (lines 102–141) with:

```typescript
// DELETE these lines:
//   const config = get(globalConfig);
//   const currentModel = config?.prediction_engine.model_overrides.level_2 || 'default';
//   const cards = [ ... ];
//   screenCards.set(cards.map(...));

// REPLACE with reactive derivation:
const cfg = $derived($globalConfig);

const cards = $derived.by(() => {
  const c = cfg;
  if (!c) return [];
  const model = c.prediction_engine.model_overrides.level_2 || 'default';
  const modelLabel = model === 'default' ? 'default' : model.split('-').slice(0, 2).join('-');
  return [
    {
      title: 'Backend Mode',
      description: c.prediction_engine.backend_mode === 'proxied' ? 'proxied via Railway' : 'direct Anthropic API',
      pills: [{ label: c.prediction_engine.backend_mode, variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: toggleBackendMode,
    },
    {
      title: 'API Key',
      description: c.prediction_engine.direct_api_key_ref ? 'configured' : 'not set — required for direct mode',
      pills: [{ label: c.prediction_engine.direct_api_key_ref ? 'configured' : 'not set', variant: (c.prediction_engine.direct_api_key_ref ? 'active' : 'neutral') as 'active' | 'neutral' }],
      variant: 'secondary_pink' as const,
      onclick: openKeyEntry,
    },
    {
      title: 'Model Override',
      description: 'A to cycle, DPAD L/R to adjust',
      pills: [{ label: modelLabel, variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => cycleModel('right'),
    },
    {
      title: 'Temperature',
      description: 'A to increase, DPAD L/R to adjust (0.0 – 2.0)',
      pills: [{ label: `${c.prediction_engine.temperature}`, variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => adjustTemperature('right'),
    },
  ];
});

// Keep screenCards in sync reactively
$effect(() => {
  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
});
```

### Fix for `SettingsDisplayScreen.svelte`

Same pattern — replace `const config = get(globalConfig)` and `const cards = [...]` with `$derived`. Also: **remove the Scanline Overlay card and the Theme card** (see Issues 6 and 7). The screen goes from 4 cards down to 2.

```typescript
const cfg = $derived($globalConfig);

const cards = $derived.by(() => {
  const c = cfg;
  if (!c) return [];
  return [
    {
      title: 'Split Ratio',
      description: 'A to increase, DPAD L/R to adjust (20% – 80%)',
      pills: [{ label: `${c.display.default_split_ratio}%`, variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => adjustSplitRatio('right'),
    },
    {
      title: 'Stick Scroll Speed',
      description: 'A to increase, DPAD L/R to adjust (0.25x – 4.0x)',
      pills: [{ label: `${c.input.stick_scroll_speed}x`, variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => adjustScrollSpeed('right'),
    },
  ];
});

$effect(() => {
  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
});
```

Delete the `toggleScanlines()` function entirely. Delete the Theme onclick handler entirely.

### Fix for `SettingsTelemetryScreen.svelte`

Same pattern:

```typescript
const cfg = $derived($globalConfig);

const cards = $derived.by(() => {
  const c = cfg;
  if (!c) return [];
  return [
    {
      title: 'Telemetry',
      description: 'anonymous usage data',
      pills: [{ label: c.telemetry.enabled ? 'enabled' : 'disabled', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: toggleTelemetry,
    },
    {
      title: 'Cost Indicator',
      description: 'show session cost in terminal header',
      pills: [{ label: c.cost_tracking.show_cost_indicator ? 'shown' : 'hidden', variant: (c.cost_tracking.show_cost_indicator ? 'active' : 'neutral') as 'active' | 'neutral' }],
      variant: 'secondary_pink' as const,
      onclick: toggleCostIndicator,
    },
    {
      title: 'Budget Alert',
      description: 'A to increase, DPAD L/R to adjust threshold',
      pills: [{ label: `$${c.cost_tracking.session_budget_warning_threshold_usd.toFixed(2)}`, variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => adjustBudget('right'),
    },
  ];
});

$effect(() => {
  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
});
```

### Fix for `SettingsAdvancedScreen.svelte`

Same pattern:

```typescript
const cfg = $derived($globalConfig);

const cards = $derived.by(() => {
  const c = cfg;
  if (!c) return [];
  return [
    {
      title: 'Permission Mode',
      description: 'A to cycle, DPAD L/R to adjust',
      pills: [{ label: c.claude_code.permission_mode, variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => cyclePermissionMode('right'),
    },
    {
      title: 'View Config',
      description: 'dump current global config to terminal',
      pills: [{ label: 'global.json', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: showConfig,
    },
    {
      title: 'System Info',
      description: 'version, platform, Tauri status',
      pills: [{ label: 'v0.1.0', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: showSystemInfo,
    },
    {
      title: 'Reset to Defaults',
      description: 'double-press to confirm — this is destructive',
      pills: [{ label: 'DESTRUCTIVE', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: handleReset,
    },
  ];
});

$effect(() => {
  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
});
```

### Fix for `SettingsScreen.svelte` (hub)

Same reactive pattern for the hub cards so they also reflect current values when returning from sub-screens:

```typescript
const cfg = $derived($globalConfig);

const cards = $derived.by(() => {
  const c = cfg;
  if (!c) return [];
  return [
    {
      title: 'Prediction Engine',
      description: 'backend mode, API key, models',
      pills: [{ label: c.prediction_engine.backend_mode, variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => navigate('settings_prediction'),
    },
    {
      title: 'Display & Input',
      description: 'split ratio, scroll speed',
      pills: [{ label: `${c.display.default_split_ratio}%`, variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => navigate('settings_display'),
    },
    {
      title: 'Telemetry & Cost',
      description: 'usage data, cost alerts',
      pills: [{ label: c.telemetry.enabled ? 'enabled' : 'disabled', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => navigate('settings_telemetry'),
    },
    {
      title: 'Advanced',
      description: 'reset, debug, system info',
      pills: [{ label: 'v0.1.0', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => navigate('settings_advanced'),
    },
  ];
});

$effect(() => {
  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
});
```

Update the hub description for Display & Input from `'split ratio, scanlines, scroll speed'` to `'split ratio, scroll speed'` (scanlines removed).

---

## Issue 2: D-pad L/R Not Wired for Settings Subscreens

**Problem**: Card descriptions say "DPAD L/R to adjust" but `inputRouter.ts` has no `DPAD_LEFT`/`DPAD_RIGHT` handlers for settings subscreens (lines 179–188). Only DPAD_UP/DPAD_DOWN (global nav) and A (activate) work.

**Fix**: Add DPAD_LEFT and DPAD_RIGHT handlers to all 4 settings subscreens. These need to know which card is currently selected and call the appropriate adjust/cycle function with the correct direction.

Each settings screen needs to export a function that the input router can call, OR we use a different approach: store adjust functions indexed by card position.

**Approach**: Create a writable store `settingsAdjustHandlers` in `app.ts` (or a new `settings.ts` store) that settings screens populate. The input router reads this store for DPAD_LEFT/DPAD_RIGHT.

### 2.1 Add to `src/lib/stores/app.ts`:

```typescript
// Settings DPAD adjust handlers — populated by settings subscreens
// Maps card index → { left: () => void, right: () => void }
export const settingsAdjustHandlers = writable<Record<number, { left: () => void; right: () => void }>>({});
```

### 2.2 Populate in each settings subscreen

In `SettingsPredictionScreen.svelte`, add after the cards derivation:

```typescript
import { settingsAdjustHandlers } from '../stores/app';

$effect(() => {
  settingsAdjustHandlers.set({
    0: { left: toggleBackendMode, right: toggleBackendMode },   // Toggle = same both directions
    1: { left: openKeyEntry, right: openKeyEntry },             // API key = open entry either way
    2: { left: () => cycleModel('left'), right: () => cycleModel('right') },
    3: { left: () => adjustTemperature('left'), right: () => adjustTemperature('right') },
  });
  return () => settingsAdjustHandlers.set({});
});
```

In `SettingsDisplayScreen.svelte` (now only 2 cards):

```typescript
import { settingsAdjustHandlers } from '../stores/app';

$effect(() => {
  settingsAdjustHandlers.set({
    0: { left: () => adjustSplitRatio('left'), right: () => adjustSplitRatio('right') },
    1: { left: () => adjustScrollSpeed('left'), right: () => adjustScrollSpeed('right') },
  });
  return () => settingsAdjustHandlers.set({});
});
```

In `SettingsTelemetryScreen.svelte`:

```typescript
import { settingsAdjustHandlers } from '../stores/app';

$effect(() => {
  settingsAdjustHandlers.set({
    0: { left: toggleTelemetry, right: toggleTelemetry },
    1: { left: toggleCostIndicator, right: toggleCostIndicator },
    2: { left: () => adjustBudget('left'), right: () => adjustBudget('right') },
  });
  return () => settingsAdjustHandlers.set({});
});
```

In `SettingsAdvancedScreen.svelte`:

```typescript
import { settingsAdjustHandlers } from '../stores/app';

$effect(() => {
  settingsAdjustHandlers.set({
    0: { left: () => cyclePermissionMode('left'), right: () => cyclePermissionMode('right') },
    // Cards 1-3 (View Config, System Info, Reset) don't have L/R adjustment
  });
  return () => settingsAdjustHandlers.set({});
});
```

### 2.3 Wire in `inputRouter.ts`

Import the new store and `selectedCardIndex`:

```typescript
import { settingsAdjustHandlers, selectedCardIndex } from '../stores/app';
```

Update the settings subscreen case (lines 179–188):

```typescript
case 'settings_prediction':
case 'settings_display':
case 'settings_telemetry':
case 'settings_advanced':
  return {
    A: activateSelected,
    B: () => { playBack(); navigate('settings'); },
    LB: () => { playBack(); navigate('settings'); },
    START: () => { playBack(); navigate(get(previousScreen) || 'empty_state'); },
    DPAD_LEFT: () => {
      const handlers = get(settingsAdjustHandlers);
      const idx = get(selectedCardIndex);
      if (handlers[idx]?.left) {
        playToggle();
        handlers[idx].left();
      }
    },
    DPAD_RIGHT: () => {
      const handlers = get(settingsAdjustHandlers);
      const idx = get(selectedCardIndex);
      if (handlers[idx]?.right) {
        playToggle();
        handlers[idx].right();
      }
    },
  };
```

**Important**: Since DPAD_LEFT/DPAD_RIGHT are now handled at the screen level, they will take priority over the global DPAD_UP/DPAD_DOWN handlers (which handle card navigation). Make sure DPAD_UP and DPAD_DOWN still fall through to global handlers — they already do because they're not in the screen handler map.

---

## Issue 3: Backend Mode "Press B to enter one"

**Problem**: In `SettingsPredictionScreen.svelte` line 45, when switching to direct mode without an API key:
```ts
entries.addEntry({ type: 'thought', label: 'WARNING', body: 'Direct mode requires an API key. Press B to enter one.' });
```
B is mapped to "go back" (both on gamepad and KBM where ESC = B). This message is wrong.

**Fix**: Change the message to reference the actual way to get to the API Key card:

```typescript
entries.addEntry({ type: 'thought', label: 'WARNING', body: 'Direct mode requires an API key. Navigate to the API Key card and press A.' });
```

---

## Issue 4: API Key Entry — Remove Full-Screen Keyboard

**Problem**: Pressing A on the API Key card opens `OnScreenKeyboard.svelte`, a full-screen overlay with a gamepad-navigable on-screen keyboard. Issues:
- No obvious way to go back (ESC on KBM does backspace, not cancel)
- The on-screen keyboard is pointless — users can just type on a real keyboard
- It's obnoxious as a whole new screen for entering a single text value

**Fix**: Replace the on-screen keyboard with a simple inline text input. When the API Key card is activated, toggle an inline input field that appears below or replaces the card description. Standard text input — users type on their real keyboard or the Steam Deck's built-in virtual keyboard (which Tauri/WebKitGTK invokes automatically on text focus).

### 4.1 Remove OnScreenKeyboard import and overlay from `SettingsPredictionScreen.svelte`

Delete:
```svelte
import OnScreenKeyboard from '../components/OnScreenKeyboard.svelte';
```

Delete:
```svelte
{#if keyboardOpen}
  <OnScreenKeyboard ... />
{/if}
```

### 4.2 Add inline key entry state

```typescript
let editingApiKey = $state(false);
let apiKeyInput = $state('');

function openKeyEntry() {
  const current = $globalConfig?.prediction_engine.direct_api_key_ref || '';
  apiKeyInput = current;
  editingApiKey = true;
  // Focus the input after Svelte renders it
  tick().then(() => {
    const input = document.getElementById('api-key-input');
    if (input) input.focus();
  });
}

function saveApiKey() {
  if (apiKeyInput.length < 10) {
    entries.addEntry({ type: 'thought', label: 'ERROR', body: 'API key too short (min 10 chars)' });
    return;
  }
  updateGlobalConfig(cfg => ({
    ...cfg,
    prediction_engine: { ...cfg.prediction_engine, direct_api_key_ref: apiKeyInput },
  }));
  entries.addEntry({ type: 'thought', label: 'SAVED', body: `API key stored (${apiKeyInput.slice(0, 10)}...)` });
  editingApiKey = false;
}

function cancelKeyEntry() {
  editingApiKey = false;
}

function handleKeyInputKeydown(e: KeyboardEvent) {
  // Prevent input events from bubbling to the gamepad/keyboard input router
  e.stopPropagation();
  if (e.key === 'Enter') {
    saveApiKey();
  } else if (e.key === 'Escape') {
    cancelKeyEntry();
  }
}
```

Import `tick` from svelte:
```typescript
import { tick } from 'svelte';
```

### 4.3 Add inline input UI

Add this between the `<TerminalPanel />` and `<ActionPalette ...>` components, or better — add it as a slot/overlay just above ActionPalette:

```svelte
{#if editingApiKey}
  <div class="absolute inset-0 z-50 bg-bg-dark/90 flex items-center justify-center">
    <div class="bg-surface-dark border border-surface-border rounded p-4 w-[420px] space-y-3">
      <h3 class="text-sm font-bold text-primary uppercase tracking-widest">Anthropic API Key</h3>
      <input
        id="api-key-input"
        type="password"
        bind:value={apiKeyInput}
        onkeydown={handleKeyInputKeydown}
        placeholder="sk-ant-api03-..."
        class="w-full bg-bg-dark border border-surface-border rounded px-3 py-2 text-sm text-white font-mono focus:border-primary focus:outline-none"
      />
      <div class="flex gap-2 justify-end">
        <button onclick={cancelKeyEntry} class="px-3 py-1.5 text-xs text-slate-400 border border-surface-border rounded hover:border-slate-500">Cancel (Esc)</button>
        <button onclick={saveApiKey} class="px-3 py-1.5 text-xs text-bg-dark bg-primary rounded font-bold hover:bg-primary/80">Save (Enter)</button>
      </div>
    </div>
  </div>
{/if}
```

Delete `handleKeyConfirm` and `handleKeyCancel` functions (replaced by `saveApiKey` and `cancelKeyEntry`).

Delete the `keyboardOpen` state variable (no longer needed).

Remove the `keyboardOpen` import from `../stores/app` if it was only used here — but check if `inputRouter.ts` also uses it. If `inputRouter.ts` checks `get(keyboardOpen)` to block input, replace that check to also account for `editingApiKey`. The simplest approach: when the input is focused, `e.stopPropagation()` on keydown already prevents the input router from seeing the events, so the `keyboardOpen` guard in inputRouter may not even be needed for this screen. Test to confirm.

---

## Issue 5: Temperature / Permission Mode Can Only Go Up

**Problem**: Temperature's onclick is `() => adjustTemperature('right')` and permission mode's onclick is `() => cyclePermissionMode('right')`. Pressing A always increments. There's no way to decrement.

**Fix**: This is fully resolved by Issue 2 (D-pad L/R wiring). Once DPAD_LEFT calls `adjustTemperature('left')` or `cyclePermissionMode('left')`, users can go both directions. The A button still increments by default which is fine — it's the primary action.

No additional code changes needed beyond Issue 2.

---

## Issue 6: Delete Scanline Overlay

**Problem**: The Scanline Overlay setting is a CRT effect on the terminal. It's not a meaningful feature and clutters the settings.

**Fix**:
1. Remove the Scanline Overlay card from `SettingsDisplayScreen.svelte` (already done in Issue 1 fix above — the new cards array only has Split Ratio and Stick Scroll Speed).

2. Remove the scanline overlay from `TerminalPanel.svelte`. Find the div with class `scan-overlay` and delete it:
```html
<!-- DELETE this entire div -->
<div class="absolute inset-0 scan-overlay z-10 pointer-events-none
  {$status === 'streaming' ? 'scan-overlay-streaming' : 'opacity-20'}">
</div>
```

3. Remove the scanline CSS from `src/app.css`. Delete the `.scan-overlay`, `.scan-overlay-streaming`, and `@keyframes scanPulse` rules.

4. Remove the `scanline_overlay` field from the terminal log in `SettingsDisplayScreen.svelte`'s `onMount`:
```typescript
// DELETE this line from onMount:
entries.addEntry({ type: 'timestamp', time: now, message: `Scanlines: ${config.display.scanline_overlay ? 'on' : 'off'}` });
```

5. Do NOT remove `scanline_overlay` from the `GlobalConfig` type or defaults — that would break existing config files. Just leave it in the type definition unused.

---

## Issue 7: Delete Theme Setting

**Problem**: Theme is a placeholder with only "default" available. It wastes a card slot.

**Fix**:
1. Remove the Theme card from `SettingsDisplayScreen.svelte` (already done in Issue 1 fix above).

2. Remove the Theme line from the terminal log in `SettingsDisplayScreen.svelte`'s `onMount`:
```typescript
// DELETE this line from onMount:
entries.addEntry({ type: 'timestamp', time: now, message: `Theme: ${config.display.theme}` });
```

3. Remove `Theme: ${config.display.theme}` from the hub `SettingsScreen.svelte` onMount terminal log as well.

4. Same as scanlines — do NOT remove from GlobalConfig type or defaults. Just stop showing it in UI.

---

## Issue 8: Settings Hub Description Updates

After removing scanlines and theme:

In `SettingsScreen.svelte`, update the Display & Input card description from:
```
'split ratio, scanlines, scroll speed'
```
to:
```
'split ratio, scroll speed'
```

---

## Verification

After all changes:

1. `npm run build` — should compile with no errors
2. Navigate to Settings → Prediction Engine:
   - Press A on Backend Mode → pill toggles between "proxied" / "direct"
   - Press DPAD_RIGHT on Model Override → pill cycles through models
   - Press DPAD_LEFT on Model Override → pill cycles back
   - Press DPAD_RIGHT on Temperature → pill shows 0.9, 1.0, etc.
   - Press DPAD_LEFT on Temperature → pill shows 0.7, 0.6, etc.
   - Press A on API Key → small centered modal with text input, ESC cancels, Enter saves
3. Navigate to Settings → Display & Input:
   - Only 2 cards: Split Ratio and Stick Scroll Speed
   - No Scanline Overlay or Theme cards
   - DPAD_LEFT/RIGHT adjust values, pills update live
4. Navigate to Settings → Telemetry & Cost:
   - Press A on Cost Indicator → pill toggles "shown" / "hidden" immediately
   - Press A on Telemetry → pill toggles "enabled" / "disabled" immediately
   - DPAD_LEFT/RIGHT on Budget → pill value goes up and down
5. Navigate to Settings → Advanced:
   - DPAD_LEFT/RIGHT on Permission Mode cycles both directions
   - Pill updates immediately
6. Navigate back to Settings hub → pills on category cards reflect current values
7. Terminal panel no longer has scanline overlay div

---

## Done State

After this prompt:
- All settings action cards reactively update their pill values when config changes
- D-pad L/R works on all adjustable settings cards (both directions)
- Scanline Overlay and Theme cards are deleted from Display & Input
- API Key entry is a simple centered modal with native text input (no on-screen keyboard)
- Backend Mode warning message no longer says "Press B"
- Temperature, model override, permission mode, scroll speed all cycle both directions
- Settings hub pills reflect current values when returning from sub-screens
- `npm run build` passes
