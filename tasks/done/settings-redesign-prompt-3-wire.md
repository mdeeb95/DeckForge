# Prompt 3 of 3: Wire Gamepad Input, Config Persistence & Interactions

## Goal
Connect the new SettingsScreen (built in Prompt 2) to the gamepad input system, config persistence, and all interactive behaviors. After this prompt, the settings screen is fully functional.

## Gamepad & Keyboard Input

### Focus Navigation (D-pad Up/Down, Arrow Keys)
- Maintain a `focusIndex` (0–13) tracking which setting row is focused
- D-pad Up / Arrow Up → decrement `focusIndex` (min 0)
- D-pad Down / Arrow Down → increment `focusIndex` (max 13)
- Section headers are **skipped** — they are not part of the focusable array
- On focus change, auto-scroll to center the focused row (see Prompt 2 for scroll formula)
- Flash the footer `↑↓` hint key cyan briefly on navigate

### Toggle / Activate (A button, Enter key)
Only fires an animation/action on the **focused** row. Each row has specific behavior:

| Row | data-key | A Button Action |
|-----|----------|-----------------|
| Backend Mode | `pred-backend` | Toggle between "Proxied" and "Direct". Pop the value badge. |
| API Key | `pred-apikey` | Show toast "On-screen keyboard would open" (placeholder) |
| Model Override | `pred-model` | No A action (use D-pad left/right) |
| Temperature | `pred-temp` | No A action (use D-pad left/right) |
| Split Ratio | `disp-split` | No A action (use D-pad left/right) |
| Scanline Overlay | `disp-scan` | Toggle On/Off. Pop the value badge. |
| Theme | `disp-theme` | Show toast "Only 'default' available" |
| Stick Scroll Speed | `disp-scroll` | No A action (use D-pad left/right) |
| Telemetry | `tel-enabled` | Toggle Enabled/Disabled. Pop the value badge. |
| Cost Indicator | `tel-cost` | Toggle Shown/Hidden. Pop the value badge. |
| Budget Alert | `tel-budget` | No A action (use D-pad left/right) |
| Permission Mode | `adv-perm` | No A action (use D-pad left/right) |
| View Config | `adv-config` | Show toast "Config dumped to terminal" |
| System Info | `adv-info` | Show toast "DeckForge v0.1.0 | Tauri 2" |
| Reset to Defaults | `adv-reset` | Show toast "Double-press Y to confirm reset" |

Flash the footer `A` hint key on toggle.

### Adjust (D-pad Left/Right, Arrow Keys)
Only fires on the **focused** row. These rows support adjustment:

| Row | Left | Right | Step |
|-----|------|-------|------|
| Model Override | Previous model in cycle | Next model in cycle | Cycle: `['default', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5']` |
| Temperature | −0.1 | +0.1 | Clamp 0.0–2.0 |
| Split Ratio | −5% | +5% | Clamp 20–80 |
| Stick Scroll Speed | −0.25x | +0.25x | Clamp 0.25–4.0 |
| Budget Alert | −$0.25 | +$0.25 | Min $0.25, no max |
| Permission Mode | Previous in cycle | Next in cycle | Cycle: `['acceptEdits', 'plan', 'full', 'bypassPermissions']` |

- Slider rows: update the fill width and thumb position with spring bounce animation
- Selector rows (Model, Permission): use the swap-out/swap-in text animation
- Flash the footer `←→` hint key on adjust

### Back / Close (B button, Escape key)
- Navigate to `previousScreen` (or `'empty_state'` if none)
- Also map START and LB to the same action
- Flash the footer `B` hint key

## Config Persistence

Every toggle and adjustment must persist to `globalConfig` via `updateGlobalConfig()`. Map each setting to its config path:

| Row | Config Path |
|-----|-------------|
| Backend Mode | `prediction_engine.backend_mode` ('proxied' / 'direct') |
| API Key | `prediction_engine.direct_api_key_ref` |
| Model Override | `prediction_engine.model_overrides.level_2` |
| Temperature | `prediction_engine.temperature` |
| Split Ratio | `display.default_split_ratio` |
| Scanline Overlay | `display.scanline_overlay` |
| Theme | `display.theme` |
| Stick Scroll Speed | `input.stick_scroll_speed` |
| Telemetry | `telemetry.enabled` |
| Cost Indicator | `cost_tracking.show_cost_indicator` |
| Budget Alert | `cost_tracking.session_budget_warning_threshold_usd` |
| Permission Mode | *(store locally or in a new config field — check existing pattern)* |

### Live Preview
- Split Ratio changes should also update the `splitRatio` store so the terminal panel resizes in real-time (matches the old behavior)

## Register Adjust Handlers
Use the existing `settingsAdjustHandlers` store pattern. In a `$effect` block inside SettingsScreen, register a handler map keyed by `focusIndex`. Each entry has `{ left: () => void, right: () => void }`.

Return a cleanup function that clears the handlers on unmount.

## Toast
Show a small toast notification at the bottom of the modal for:
- Toggle confirmations (e.g., "Backend → proxied")
- Adjustment confirmations (e.g., "Temp → 0.8")
- Info messages (e.g., "Config dumped to terminal")

Toast appears for 1.2s then fades out. Style it with cyan border, mono font, glow shadow — same as the mockup.

## Input Router Update
In `inputRouter.ts`, the `case 'settings':` block should already have been updated in Prompt 1 to include DPAD_LEFT/RIGHT handlers that call `settingsAdjustHandlers`. Verify this works with the new handler registration.

## Animation Scoping
**Critical**: when a toggle or adjustment fires, only the **focused row's** value element should animate (pop/bounce). Other rows must not react. Use the `data-key` of the focused row to scope animations — do not broadcast animations to all value elements.

## Terminal Logging
On mount, log to terminal:
```
[SETTINGS] DeckForge Configuration
[timestamp] Backend: proxied
[timestamp] API Key: not set
[timestamp] Split Ratio: 55%
[timestamp] Telemetry: enabled
[timestamp] Budget Alert: $0.50
[cursor] Select a setting to configure
```

On each change, log the new value:
```
[thought] SPLIT → 60%
[thought] Backend → direct
```

## Verification Checklist
- [ ] D-pad up/down navigates between the 14 setting rows, skipping section headers
- [ ] Focused row shows the cyan left bar, scale, glow, and label color change
- [ ] Unfocused transition is smooth (no jank, no re-trigger of entrance animation)
- [ ] A button toggles the correct setting, pop animation only on that row
- [ ] D-pad left/right adjusts sliders/selectors, bounce animation only on that row
- [ ] B / Escape / START / LB all close the settings modal and return to previous screen
- [ ] All changes persist to `globalConfig` (check with "View Config" action)
- [ ] Split ratio change reflects live in the terminal panel width
- [ ] Toast shows and auto-hides
- [ ] Stagger entrance animation plays on open
- [ ] Backdrop blur and modal scale-in animate on open
- [ ] Gamepad polling works (test with connected controller if available)
- [ ] No references to old sub-screens remain in codebase

## Do NOT
- Do not modify any non-settings screens or components
- Do not change the config types (GlobalConfig interface)
- Do not add new screen types to the router
- Do not break the existing gamepad handling for other screens
