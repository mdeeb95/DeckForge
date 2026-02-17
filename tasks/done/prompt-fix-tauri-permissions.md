# Prompt: Fix Tauri Permission Errors

## Problem
Multiple Tauri permission errors are blocking DeckForge from working:

### FS errors (all `allow-exists` scope violations):
```
forbidden path: /Users/mdeeb95/.config/deckforge/global.json
forbidden path: .../.deckforge/project.json
```
The current `$HOME/**` glob scope is NOT matching paths with hidden directories (`.config`, `.deckforge`).

### Shell errors:
```
shell.execute not allowed. Permissions associated with this command: shell:allow-execute
```
`contextAssembler.ts` uses `Command.create().execute()` but only `shell:allow-spawn` is configured.
Also, commands `ls`, `find`, `wc` aren't in the command allowlist at all.

## Fix

### 1. capabilities/default.json — Fix FS scope

The `$HOME/**` glob appears to not match hidden directory paths on this platform. Add explicit hidden-directory patterns as a fallback. Update ALL four FS permission entries:

```json
{
  "identifier": "fs:allow-exists",
  "allow": [
    { "path": "$HOME/**" },
    { "path": "$HOME/.**" },
    { "path": "$HOME/.config/**" },
    { "path": "$HOME/.config/deckforge/**" },
    { "path": "$HOME/**/.**" },
    { "path": "$HOME/**/.deckforge/**" }
  ]
},
{
  "identifier": "fs:allow-mkdir",
  "allow": [
    { "path": "$HOME/**" },
    { "path": "$HOME/.**" },
    { "path": "$HOME/.config/**" },
    { "path": "$HOME/.config/deckforge/**" },
    { "path": "$HOME/**/.**" },
    { "path": "$HOME/**/.deckforge/**" }
  ]
},
{
  "identifier": "fs:allow-read-text-file",
  "allow": [
    { "path": "$HOME/**" },
    { "path": "$HOME/.**" },
    { "path": "$HOME/.config/**" },
    { "path": "$HOME/.config/deckforge/**" },
    { "path": "$HOME/**/.**" },
    { "path": "$HOME/**/.deckforge/**" }
  ]
},
{
  "identifier": "fs:allow-write-text-file",
  "allow": [
    { "path": "$HOME/**" },
    { "path": "$HOME/.**" },
    { "path": "$HOME/.config/**" },
    { "path": "$HOME/.config/deckforge/**" },
    { "path": "$HOME/**/.**" },
    { "path": "$HOME/**/.deckforge/**" }
  ]
}
```

### 2. capabilities/default.json — Add shell:allow-execute

Add `shell:allow-execute` permission with the same command allowlist as `shell:allow-spawn`. Copy the entire `allow` array from the existing `shell:allow-spawn` entry, and ADD these additional commands that `contextAssembler.ts` needs:

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "ls",
      "cmd": "ls",
      "args": true
    },
    {
      "name": "find",
      "cmd": "find",
      "args": true
    },
    {
      "name": "wc",
      "cmd": "wc",
      "args": true
    },
    {
      "name": "git",
      "cmd": "git",
      "args": true
    },
    {
      "name": "claude",
      "cmd": "/Users/mdeeb95/.local/bin/claude",
      "args": true
    },
    {
      "name": "sh",
      "cmd": "sh",
      "args": true
    },
    {
      "name": "npm",
      "cmd": "npm",
      "args": true
    },
    {
      "name": "npx",
      "cmd": "npx",
      "args": true
    }
  ]
}
```

Also add `ls`, `find`, and `wc` to the EXISTING `shell:allow-spawn` list so they're available for both methods:

```json
{
  "name": "ls",
  "cmd": "ls",
  "args": true
},
{
  "name": "find",
  "cmd": "find",
  "args": true
},
{
  "name": "wc",
  "cmd": "wc",
  "args": true
}
```

### 3. Full capabilities/default.json structure

The final permissions array should include (in order):
1. `"core:default"`
2. `"fs:default"`
3. `fs:allow-exists` with expanded scope
4. `fs:allow-mkdir` with expanded scope
5. `fs:allow-read-text-file` with expanded scope
6. `fs:allow-write-text-file` with expanded scope
7. `"shell:default"`
8. `shell:allow-spawn` with ALL commands (existing + ls, find, wc)
9. `shell:allow-execute` with needed commands (ls, find, wc, git, claude, sh, npm, npx)
10. `"shell:allow-stdin-write"`
11. `"shell:allow-kill"`
12. `"dialog:default"`
13. `"dialog:allow-open"`

### 4. After changing capabilities, restart Tauri dev

```bash
# Kill existing tauri dev process, then:
npm run tauri dev
```

Capabilities changes require a full restart — HMR won't pick them up.

## Verification

After the fix, the console should show:
- `[LIFECYCLE] initApp: global config loaded` — WITHOUT the "forbidden path" error before it
- `[FS] openProject: config loaded` — WITHOUT the "forbidden path" error
- No `shell.execute not allowed` errors from contextAssembler

## Important Notes
- Do NOT remove any existing commands from shell:allow-spawn
- Keep the absolute path for claude: `/Users/mdeeb95/.local/bin/claude`
- The FS scope patterns with `.**` explicitly match hidden directories as a fallback
- Run `npm run tauri dev` after changes — capabilities need full restart
