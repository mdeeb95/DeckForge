# Prompt 1 of 3: Settings Screen Teardown

## Goal
Remove the old hub-and-spoke settings architecture (5 screens) and consolidate to a single `settings` screen route. The old design used ActionCard/ActionPalette with 4 sub-screens — the new design is a single modal with a scrollable mega-list. This prompt cleans house. Prompt 2 builds the new screen.

## Files to DELETE
- `src/lib/screens/SettingsPredictionScreen.svelte`
- `src/lib/screens/SettingsDisplayScreen.svelte`
- `src/lib/screens/SettingsTelemetryScreen.svelte`
- `src/lib/screens/SettingsAdvancedScreen.svelte`

## Files to MODIFY

### 1. `src/lib/stores/app.ts`
Remove these 4 values from the `Screen` type union:
- `'settings_prediction'`
- `'settings_display'`
- `'settings_telemetry'`
- `'settings_advanced'`

Keep `'settings'` — that's the only settings route now.

### 2. `src/lib/components/ScreenRouter.svelte`
- Remove the 4 imports for the deleted sub-screens (`SettingsPredictionScreen`, `SettingsDisplayScreen`, `SettingsTelemetryScreen`, `SettingsAdvancedScreen`)
- Remove the 4 `{:else if}` blocks that rendered them (`settings_prediction`, `settings_display`, `settings_telemetry`, `settings_advanced`)
- Keep the `{:else if $currentScreen === 'settings'}` block — it stays

### 3. `src/lib/input/inputRouter.ts`
- Remove the entire `case 'settings_prediction': case 'settings_display': case 'settings_telemetry': case 'settings_advanced':` block (lines ~179–206). This whole block is dead code now.
- **Modify** the `case 'settings':` handler. Replace it with this new handler structure:
  - `A` → calls a new action: toggle/activate the currently focused setting row (we'll implement the actual function in Prompt 2, for now just call `activateSelected`)
  - `B` → navigate back to `previousScreen` (same as before: `navigate(get(previousScreen) || 'empty_state')`)
  - `START` → same as B (close settings)
  - `LB` → same as B
  - `DPAD_LEFT` → call the left adjust handler from `settingsAdjustHandlers` (same pattern as the old sub-screen handler had)
  - `DPAD_RIGHT` → call the right adjust handler from `settingsAdjustHandlers`

This effectively promotes the old sub-screen input handling up to the `'settings'` case, since there are no sub-screens anymore.

### 4. `src/lib/screens/SettingsScreen.svelte`
- **Gut the entire file contents** — remove all the old hub card logic, ActionPalette usage, terminal entries, etc.
- Leave it as a minimal placeholder that just renders a `<div>Settings placeholder</div>` — Prompt 2 will rebuild it entirely.
- Remove imports for `ActionPalette`, `TerminalPanel`, and the old stores it used (`screenCards`, `selectedCardIndex`).
- Keep the import for `globalConfig` and `navigate` — we'll need those in Prompt 2.

## Verification
After this prompt:
- The app should compile with no errors (`npm run dev` / `npm run build`)
- Navigating to settings should show the placeholder text
- Pressing B/START/LB on the settings screen should navigate back
- No references to `settings_prediction`, `settings_display`, `settings_telemetry`, or `settings_advanced` should exist anywhere in the codebase
- The 4 deleted `.svelte` files should be gone

## Do NOT
- Do not build the new settings UI yet — that's Prompt 2
- Do not remove the `settingsAdjustHandlers` store — we'll reuse it
- Do not remove `globalConfig`, `updateGlobalConfig`, or any config types — all still needed
- Do not touch any non-settings screens
