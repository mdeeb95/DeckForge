---
name: do-task
description: Complete a task from tasks/todo/ — implement changes, verify, and move to tasks/done/
disable-model-invocation: true
argument-hint: [task-filename-or-partial-match]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Complete a DeckForge Task

Complete the task file specified by `$ARGUMENTS` from the `tasks/todo/` directory.

## Workflow

1. **Find the task file.** Glob `tasks/todo/*$ARGUMENTS*` to locate it. If no argument given, list all files in `tasks/todo/` and ask which one to work on. If multiple matches, ask for clarification.

2. **Read the task file** in full. Understand every requirement.

3. **Read all files that will be modified** before making any changes. Never propose changes to code you haven't read.

4. **Implement all changes** described in the task. Follow the task's instructions precisely.

5. **Verify the work:**
   - Run `npm run check` — must be 0 TypeScript errors.
   - Run `npm run test:integration` — all tests must pass.
   - If the task specifies backend changes, verify with `.venv/bin/python` import/smoke tests.
   - Write and perform e2e tests to the best of your ability. Verify the code runs within the application as if you were a software engineer demoing it. Be considerate of the intention of the feature, and behave as a UX specialist.

6. **Move the task file** from `tasks/todo/` to `tasks/done/`:
   ```
   mv tasks/todo/<filename> tasks/done/<filename>
   ```

7. **Report what was done** — concise summary of files changed and what each change does.

8. **Suggest improvements that can be made from here** - Improvements, testing, styles, functionality, tech debt considerations. Do not be overly agreeable for no reason.

## Rules

- If verification fails, fix the issue and re-verify. Do NOT move to done until checks pass.
- Do not over-engineer. Only make changes the task specifies.
- Follow DeckForge design rules from CLAUDE.md (no scroll, 1280x800, color only where meaningful).
- Keep the summary short. Mathew doesn't want walls of text.
