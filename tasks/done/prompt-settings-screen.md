# Task: Settings Screen — Full Implementation

## Goal

Build a complete gamepad-navigable Settings system: a START menu overlay accessible from any screen, a Settings hub with 4 category cards, and sub-screens for each category.

This is a large task with **2 independent pieces** that can be built in parallel, plus a final integration step:

1. **START Menu Overlay** (standalone, global)
2. **Settings Hub + Sub-Screens** (depends on 1)

---

## Text Input Approach — Native Input + Steam Deck Keyboard

**No custom on-screen keyboard.** The Steam Deck already has a system-level virtual keyboard overlay (Steam + X or auto-pops when a text field is focused). We use native HTML `<input>` elements and let the OS handle the keyboard.

### Reusable Component: `src/lib/components/TextInputOverlay.svelte`

A full-screen overlay with a styled native `<input>` that the Steam Deck keyboard attaches to.

```svelte
<script lang="ts">
  interface Props {
    label: string;            // "Enter Anthropic API Key"
    placeholder?: string;     // "sk-ant-api03-..."
    value?: string;           // Pre-filled value
    type?: 'text' | 'password'; // password = masked
    onConfirm: (value: string) => void;
    onCancel: () => void;
  }

  let { label, placeholder = '', value = '', type = 'text', onConfirm, onCancel }: Props = $props();
  let inputValue = $state(value);
  let inputEl: HTMLInputElement;

  import { onMount } from 'svelte';

  onMount(() => {
    // Auto-focus triggers Steam Deck keyboard overlay
    inputEl?.focus();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(inputValue);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
</script>

<!-- Full-screen overlay -->
<div class="fixed inset-0 z-40 bg-background-dark/95 backdrop-blur-sm flex items-center justify-center">
  <div class="w-full max-w-[600px] px-8">
    <!-- Label -->
    <div class="text-center mb-6">
      <h2 class="text-primary font-bold text-lg mb-2">{label}</h2>
      <p class="text-xs text-slate-500">Type your value and press Enter to confirm</p>
    </div>

    <!-- Input field — native HTML input, Steam Deck keyboard auto-attaches -->
    <input
      bind:this={inputEl}
      bind:value={inputValue}
      {type}
      {placeholder}
      onkeydown={handleKeydown}
      class="w-full bg-surface-dark border-2 border-primary/50 rounded p-4 font-mono text-lg text-primary
             placeholder-slate-600 outline-none focus:border-primary focus:shadow-[0_0_15px_rgba(13,242,242,0.3)]
             caret-primary"
      autocomplete="off"
      spellcheck="false"
    />

    <!-- Display masked preview if password type -->
    {#if type === 'password' && inputValue.length > 0}
      <div class="mt-3 text-xs text-slate-500 font-mono">
        {inputValue.slice(0, 10)}{'•'.repeat(Math.max(0, inputValue.length - 10))}
      </div>
    {/if}

    <!-- Button hints -->
    <div class="flex justify-center gap-6 mt-6 text-[10px] text-slate-500 font-mono">
      <span><span class="text-primary">ENTER</span> Confirm</span>
      <span><span class="text-slate-400">ESC</span> Cancel</span>
    </div>
  </div>
</div>
```

Usage from settings:
```svelte
{#if keyInputOpen}
  <TextInputOverlay
    label="Enter Anthropic API Key"
    placeholder="sk-ant-api03-..."
    type="password"
    onConfirm={handleKeyConfirm}
    onCancel={() => keyInputOpen = false}
  />
{/if}
```

The Steam Deck virtual keyboard pops up automatically when the `<input>` gets focus. Users type with the system keyboard, press Enter to confirm. Simple, reliable, zero custom keyboard code.

---

## PIECE 1: START Menu Overlay

### File: `src/lib/components/StartMenu.svelte`

A quick-access overlay that appears when START is pressed from any screen. Semi-transparent, shows 3-4 action items, dismissible with B or START.

### Layout

```
┌──────────────────────────────────────────────┐
│                                              │
│              ┌──────────────────┐            │
│              │  ⚙  MENU         │            │
│              ├──────────────────┤            │
│              │ A  Settings      │            │
│              │ B  Close Menu    │            │
│              │ X  About         │            │
│              │ Y  Quit App      │            │
│              ├──────────────────┤            │
│              │ START  Close     │            │
│              └──────────────────┘            │
│                                              │
└──────────────────────────────────────────────┘
```

### State

```typescript
// In src/lib/stores/app.ts, add:
export const startMenuOpen = writable(false);

export function toggleStartMenu() {
  startMenuOpen.update(v => !v);
}
```

### Component

```svelte
<script lang="ts">
  import { startMenuOpen, navigate } from '../stores/app';
  import { onMount, onDestroy } from 'svelte';

  let selectedIndex = $state(0);
  const items = [
    { button: 'A', label: 'Settings', icon: 'settings', action: () => { startMenuOpen.set(false); navigate('settings'); } },
    { button: 'B', label: 'Close Menu', icon: 'close', action: () => startMenuOpen.set(false) },
    { button: 'X', label: 'About', icon: 'info', action: () => showAbout() },
    { button: 'Y', label: 'Quit App', icon: 'power_settings_new', action: () => quitApp() },
  ];

  function showAbout() {
    // Show version info in a small panel or navigate to about screen
  }

  async function quitApp() {
    const { exit } = await import('@tauri-apps/plugin-process');
    await exit(0);
  }
</script>

{#if $startMenuOpen}
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
    <!-- Menu card -->
    <div class="w-[280px] bg-surface-dark border border-surface-border rounded shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="px-4 py-3 border-b border-surface-border flex items-center gap-2">
        <span class="material-icons text-primary text-sm">settings</span>
        <span class="text-xs font-bold text-primary uppercase tracking-wider">Menu</span>
      </div>

      <!-- Items -->
      <div class="p-2 space-y-1">
        {#each items as item, i}
          <div class="flex items-center gap-3 px-3 py-2 rounded transition-colors {i === selectedIndex ? 'bg-primary/10 border border-primary/30' : 'border border-transparent hover:bg-slate-800'}">
            <div class="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold {i === selectedIndex ? 'bg-primary text-black' : 'bg-slate-700 text-slate-300'}">{item.button}</div>
            <span class="material-icons text-sm {i === selectedIndex ? 'text-primary' : 'text-slate-400'}">{item.icon}</span>
            <span class="text-sm {i === selectedIndex ? 'text-primary font-medium' : 'text-slate-300'}">{item.label}</span>
          </div>
        {/each}
      </div>

      <!-- Footer hint -->
      <div class="px-4 py-2 border-t border-surface-border">
        <span class="text-[10px] text-slate-500 font-mono">START  Close</span>
      </div>
    </div>
  </div>
{/if}
```

### Gamepad Integration

The START menu captures gamepad input when open. Modify the main input handler:

```typescript
// In the main gamepad handler (inputRouter.ts or wherever START is processed):
if (button === 'START') {
  // If start menu is open, close it
  if (get(startMenuOpen)) {
    startMenuOpen.set(false);
    return;
  }
  // If on-screen keyboard is open, don't open menu
  // Otherwise, open menu
  startMenuOpen.set(true);
  return;
}

// If start menu is open, route ALL input to the menu:
if (get(startMenuOpen)) {
  switch(button) {
    case 'DPAD_UP': menuSelectedIndex = Math.max(0, menuSelectedIndex - 1); break;
    case 'DPAD_DOWN': menuSelectedIndex = Math.min(items.length - 1, menuSelectedIndex + 1); break;
    case 'A': items[0].action(); break;  // Settings
    case 'B': startMenuOpen.set(false); break;  // Close
    case 'X': items[2].action(); break;  // About
    case 'Y': items[3].action(); break;  // Quit
  }
  return; // Don't pass input to underlying screen
}
```

### Mount Location

Mount `<StartMenu />` in `App.svelte`, above `<ScreenRouter />` but below `<FlashOverlay />`:

```svelte
<StatusBar ... />
<ScreenRouter />
<StartMenu />
<FlashOverlay />
```

---

## PIECE 2: Settings Hub + Sub-Screens

### Screen: `src/lib/screens/SettingsScreen.svelte` (Hub)

The hub screen. 4 category cards on the right, config summary on the left terminal.

**Right panel cards:**

| Button | Title | Description | Pill | Color |
|--------|-------|-------------|------|-------|
| A | Prediction Engine | Backend mode, API key, models | `proxied` or `direct` | primary (cyan) |
| B | Display & Input | Split ratio, scanlines, grip bindings | `55%` | secondary_pink |
| X | Telemetry & Cost | Usage data, cost alerts | `enabled` or `disabled` | neutral (slate) |
| Y | Advanced | Reset, debug, system info | `v0.1.0` | amber |

**Secondary cards:**
- `START` → Close Settings (return to previous screen)
- `LB` → Back (same as START on hub)

**Terminal entries on mount:**
```typescript
onMount(() => {
  entries.clear();
  status.set('idle');

  const config = get(globalConfig);
  if (!config) return;

  entries.addEntry({ type: 'prompt', label: 'SETTINGS', body: 'DeckForge Configuration' });
  entries.addEntry({ type: 'timestamp', message: `Backend: ${config.prediction_engine.backend_mode}` });
  entries.addEntry({ type: 'timestamp', message: `API Key: ${config.prediction_engine.direct_api_key_ref ? 'configured' : 'not set'}` });
  entries.addEntry({ type: 'timestamp', message: `Theme: ${config.display.theme}` });
  entries.addEntry({ type: 'timestamp', message: `Split Ratio: ${config.display.default_split_ratio}%` });
  entries.addEntry({ type: 'timestamp', message: `Telemetry: ${config.telemetry.enabled ? 'enabled' : 'disabled'}` });
  entries.addEntry({ type: 'timestamp', message: `Budget Alert: $${config.cost_tracking.session_budget_warning_threshold_usd.toFixed(2)}` });
  entries.addEntry({ type: 'cursor', message: 'Select a category to configure' });
});
```

**Navigation:** A/B/X/Y navigate to sub-screens. Store the previous screen so START can return there:

```typescript
import { previousScreen } from '../stores/app';
// When entering settings, store where we came from
// START → navigate(get(previousScreen) || 'empty_state')
```

Add `previousScreen` to the app store:
```typescript
export const previousScreen = writable<Screen>('empty_state');
```

Update `navigate()` to track previous:
```typescript
export function navigate(screen: Screen) {
  const current = get(currentScreen);
  if (!screen.startsWith('settings')) {
    previousScreen.set(current);
  }
  currentScreen.set(screen);
  selectedCardIndex.set(0);
}
```

---

### Screen: `src/lib/screens/SettingsPredictionScreen.svelte`

The most important sub-screen — controls how predictions are powered.

**Cards:**

| Button | Title | Description | Behavior |
|--------|-------|-------------|----------|
| A | Backend Mode | `proxied` / `direct` | A toggles between modes |
| B | API Key | `configured` / `not set` | B opens OnScreenKeyboard |
| X | Model Override | `default` / model name | DPAD L/R cycles models |
| Y | Temperature | `0.8` | DPAD L/R adjusts ±0.1 |

**Secondary cards:**
- `LB` → Back to Settings hub

**Backend Mode Toggle (A):**
```typescript
function toggleBackendMode() {
  const current = get(globalConfig);
  if (!current) return;
  const newMode = current.prediction_engine.backend_mode === 'proxied' ? 'direct' : 'proxied';

  updateGlobalConfig(cfg => ({
    ...cfg,
    prediction_engine: { ...cfg.prediction_engine, backend_mode: newMode },
  }));

  entries.addEntry({
    type: 'thought',
    label: 'UPDATED',
    body: `Backend mode → ${newMode}`,
  });

  if (newMode === 'direct' && !current.prediction_engine.direct_api_key_ref) {
    entries.addEntry({
      type: 'thought',
      label: 'WARNING',
      body: 'Direct mode requires an API key. Press B to enter one.',
    });
  }
}
```

**API Key Entry (B):**
```typescript
let keyboardOpen = $state(false);

function openKeyEntry() {
  keyboardOpen = true;
}

function handleKeyConfirm(value: string) {
  keyboardOpen = false;
  if (!value || value.length < 10) {
    entries.addEntry({ type: 'thought', label: 'ERROR', body: 'API key too short' });
    return;
  }
  updateGlobalConfig(cfg => ({
    ...cfg,
    prediction_engine: { ...cfg.prediction_engine, direct_api_key_ref: value },
  }));
  entries.addEntry({
    type: 'thought',
    label: 'SAVED',
    body: `API key stored (${value.slice(0, 10)}...)`,
  });
}

function handleKeyCancel() {
  keyboardOpen = false;
}
```

In the template:
```svelte
{#if keyboardOpen}
  <TextInputOverlay
    label="Enter Anthropic API Key"
    placeholder="sk-ant-api03-..."
    type="password"
    onConfirm={handleKeyConfirm}
    onCancel={() => keyboardOpen = false}
  />
{/if}
```

**Model Override (X) — DPAD left/right cycles:**
```typescript
const availableModels = ['default', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-5-20251101'];
let modelIndex = $state(0);

// When DPAD_LEFT/RIGHT is pressed while X card is selected:
function cycleModel(direction: 'left' | 'right') {
  modelIndex = direction === 'right'
    ? (modelIndex + 1) % availableModels.length
    : (modelIndex - 1 + availableModels.length) % availableModels.length;

  const model = availableModels[modelIndex] === 'default' ? null : availableModels[modelIndex];
  updateGlobalConfig(cfg => ({
    ...cfg,
    prediction_engine: {
      ...cfg.prediction_engine,
      model_overrides: { ...cfg.prediction_engine.model_overrides, level_2: model },
    },
  }));
}
```

**Temperature (Y) — DPAD left/right adjusts:**
```typescript
function adjustTemperature(direction: 'left' | 'right') {
  const delta = direction === 'right' ? 0.1 : -0.1;
  updateGlobalConfig(cfg => ({
    ...cfg,
    prediction_engine: {
      ...cfg.prediction_engine,
      temperature: Math.max(0, Math.min(2, +(cfg.prediction_engine.temperature + delta).toFixed(1))),
    },
  }));
}
```

---

### Screen: `src/lib/screens/SettingsDisplayScreen.svelte`

**Cards:**

| Button | Title | Description | Behavior |
|--------|-------|-------------|----------|
| A | Split Ratio | `55%` | DPAD L/R adjusts ±5%, live preview |
| B | Scanline Overlay | `on` / `off` | B toggles |
| X | Theme | `default` | DPAD L/R cycles (future: only "default" for now) |
| Y | Stick Scroll Speed | `1.0x` | DPAD L/R adjusts ±0.25 |

**Secondary cards:**
- `LB` → Back to Settings hub

**Split Ratio** should apply immediately so the user sees the change in real-time. Read from store, write on change. The terminal panel and action palette already react to `splitRatio` store.

---

### Screen: `src/lib/screens/SettingsTelemetryScreen.svelte`

**Cards:**

| Button | Title | Description | Behavior |
|--------|-------|-------------|----------|
| A | Telemetry | `enabled` / `disabled` | A toggles |
| B | Cost Indicator | `shown` / `hidden` | B toggles |
| X | Budget Alert | `$0.50` | DPAD L/R adjusts ±$0.25 |

**Secondary cards:**
- `LB` → Back to Settings hub

Simple toggles. Each change writes to `globalConfig` and logs to terminal.

---

### Screen: `src/lib/screens/SettingsAdvancedScreen.svelte`

**Cards:**

| Button | Title | Description | Behavior |
|--------|-------|-------------|----------|
| A | Permission Mode | `acceptEdits` | DPAD L/R cycles modes |
| B | View Config | Shows config file path | B opens terminal dump of current config |
| X | System Info | Version, OS, Tauri | X shows system details in terminal |
| Y | Reset to Defaults | `DESTRUCTIVE` | Y requires confirmation |

**Secondary cards:**
- `LB` → Back to Settings hub

**Reset to Defaults (Y):**
```typescript
let confirmReset = false;

function handleReset() {
  if (!confirmReset) {
    confirmReset = true;
    entries.addEntry({
      type: 'thought',
      label: 'WARNING',
      body: 'Press Y again to confirm reset. All settings will return to defaults.',
    });
    // Auto-clear confirmation after 3 seconds
    setTimeout(() => { confirmReset = false; }, 3000);
    return;
  }
  // Actually reset
  const newConfig = await createDefaultGlobalConfig();
  globalConfig.set(newConfig);
  await saveGlobalConfig(newConfig);
  entries.addEntry({ type: 'thought', label: 'RESET', body: 'All settings restored to defaults.' });
  confirmReset = false;
}
```

**View Config (B):**
```typescript
function showConfig() {
  const config = get(globalConfig);
  entries.addEntry({
    type: 'code',
    label: 'global.json',
    body: JSON.stringify(config, null, 2),
  });
}
```

---

## PIECE 3: Integration & Wiring

### ScreenRouter Changes

Add all new screen types to `src/lib/stores/app.ts` Screen type:
```typescript
| 'settings'
| 'settings_prediction'
| 'settings_display'
| 'settings_telemetry'
| 'settings_advanced'
```

Add to `ScreenRouter.svelte`:
```svelte
import SettingsScreen from '../screens/SettingsScreen.svelte';
import SettingsPredictionScreen from '../screens/SettingsPredictionScreen.svelte';
import SettingsDisplayScreen from '../screens/SettingsDisplayScreen.svelte';
import SettingsTelemetryScreen from '../screens/SettingsTelemetryScreen.svelte';
import SettingsAdvancedScreen from '../screens/SettingsAdvancedScreen.svelte';

{:else if $currentScreen === 'settings'}
  <SettingsScreen />
{:else if $currentScreen === 'settings_prediction'}
  <SettingsPredictionScreen />
{:else if $currentScreen === 'settings_display'}
  <SettingsDisplayScreen />
{:else if $currentScreen === 'settings_telemetry'}
  <SettingsTelemetryScreen />
{:else if $currentScreen === 'settings_advanced'}
  <SettingsAdvancedScreen />
```

### Input Handler Changes

Add settings screen handlers to `inputRouter.ts`. Key behavior:
- On settings hub: A/B/X/Y navigate to sub-screens, START closes settings
- On sub-screens: A/B/X/Y act on the selected card, DPAD L/R adjusts values, LB goes back to hub
- When TextInputOverlay is open: native HTML input handles keyboard, gamepad input paused
- When StartMenu is open: it captures ALL gamepad input

Priority order for input capture:
1. TextInputOverlay (native input focused — gamepad paused)
2. StartMenu
3. Current screen handler

### EmptyStateScreen Changes

Wire the existing LB button to open settings:
```typescript
// Find the LB "Settings" button handler and change to:
onclick: () => navigate('settings')
```

### Prediction Client Changes

Modify `src/lib/prediction/client.ts` to support direct mode:

```typescript
import { get } from 'svelte/store';
import { globalConfig } from '../stores/configStores';

export async function predictSuggestions(
  category: Category,
  context: ContextPayload,
  signal?: AbortSignal,
): Promise<PredictionResponse> {
  const config = get(globalConfig);

  // Direct mode: call Anthropic API directly with user's key
  if (config?.prediction_engine.backend_mode === 'direct' && config.prediction_engine.direct_api_key_ref) {
    try {
      return await directPredictSuggestions(category, context, config.prediction_engine.direct_api_key_ref, signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      console.warn('Direct prediction failed, falling back to mock:', e);
    }
    return mockPredictSuggestions(category);
  }

  // Proxied mode: existing behavior via Railway backend
  const token = getAccessToken();
  if (token) {
    try {
      return await remotePredictSuggestions(category, context, token, signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      console.warn('Remote prediction failed, falling back to mock:', e);
    }
  }
  return mockPredictSuggestions(category);
}
```

Add `directPredictSuggestions()` that calls the Anthropic Messages API directly:
```typescript
async function directPredictSuggestions(
  category: Category,
  context: ContextPayload,
  apiKey: string,
  signal?: AbortSignal,
): Promise<PredictionResponse> {
  const config = get(globalConfig);
  const model = config?.prediction_engine.model_overrides?.level_2 || 'claude-sonnet-4-5-20250929';
  const temperature = config?.prediction_engine.temperature || 0.8;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature,
      system: buildPredictionSystemPrompt(category, context),
      messages: [{ role: 'user', content: buildPredictionUserPrompt(category, context) }],
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return parsePredictionResponse(data);
}
```

**Note:** The `buildPredictionSystemPrompt()`, `buildPredictionUserPrompt()`, and `parsePredictionResponse()` functions should be extracted from the existing backend logic or replicated on the frontend. If the backend already has these prompts, copy them. The response format must match what `remotePredictSuggestions()` returns.

Do the same for `generatePlan` and `expandPlanRemote` — add direct-mode variants that call Anthropic API.

---

## Files Summary

### New Files

| File | What |
|------|------|
| `src/lib/components/TextInputOverlay.svelte` | Reusable text input overlay (Steam Deck keyboard auto-attaches) |
| `src/lib/components/StartMenu.svelte` | Global START menu overlay |
| `src/lib/screens/SettingsScreen.svelte` | Settings hub (4 category cards) |
| `src/lib/screens/SettingsPredictionScreen.svelte` | Backend mode, API key, models, temperature |
| `src/lib/screens/SettingsDisplayScreen.svelte` | Split ratio, scanlines, theme, scroll speed |
| `src/lib/screens/SettingsTelemetryScreen.svelte` | Telemetry, cost indicator, budget alert |
| `src/lib/screens/SettingsAdvancedScreen.svelte` | Permission mode, view config, reset |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/stores/app.ts` | Add settings screen types, `startMenuOpen`, `previousScreen`, `toggleStartMenu()` |
| `src/lib/components/ScreenRouter.svelte` | Add routing for 5 new screens |
| `src/lib/input/inputRouter.ts` | Add handlers for settings screens, START menu capture, keyboard capture |
| `src/App.svelte` | Mount `<StartMenu />` |
| `src/lib/screens/EmptyStateScreen.svelte` | Wire LB button to `navigate('settings')` |
| `src/lib/prediction/client.ts` | Add direct-mode API calls |

---

## Verification

1. Press START from any screen → menu overlay appears with Settings/Close/About/Quit
2. Select Settings → hub shows 4 category cards with current values in pills
3. A → Prediction Engine → toggle backend mode, enter API key via on-screen keyboard, cycle models
4. B → Display → adjust split ratio with DPAD L/R (live preview), toggle scanlines
5. X → Telemetry → toggle telemetry, adjust budget threshold
6. Y → Advanced → view config dump, reset to defaults (double-Y confirm)
7. LB on any sub-screen → back to hub
8. START on any settings screen → return to where you came from
9. API key input: text field focuses, Steam Deck keyboard pops up, type key, press Enter to save
10. Set direct mode + enter API key → predictions call Anthropic API directly (check network tab — no Railway calls)
11. All changes persist after closing and reopening DeckForge
