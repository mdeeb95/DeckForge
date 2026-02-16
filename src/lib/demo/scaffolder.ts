// ─── Demo Project Scaffolder ─────────────────────────────────────────────────
// Writes pong-template files to ~/projects/pong-demo/ and runs npm install.

import packageJson from './pong-template/package.json?raw';
import serverJs from './pong-template/server.js?raw';
import indexHtml from './pong-template/index.html?raw';
import { createDefaultProjectConfig } from '../data/defaults';
import { saveProjectConfig } from '../data/config';
import { devLog, devError } from '../utils/devLog';

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── CLAUDE.md content for the pong project ──────────────────────────────────

const CLAUDE_MD = `# Pong Demo

Multiplayer Pong game built with Node.js, Express, and WebSockets.

## Architecture
- \`server.js\` — Express + WebSocket server with authoritative game physics at 60fps
- \`index.html\` — Canvas-based client with keyboard and touch input
- Port 3000, single file server

## Tech Stack
- Node.js + Express + ws (WebSocket)
- Vanilla HTML5 Canvas
- No build step — run directly with \`node server.js\`

## Game Rules
- First to 11 points wins
- Ball speed increases each paddle hit
- 2-second pause after each point
- Player 1 = left paddle, Player 2 = right paddle
- Spectators can watch but not play

## How to Run
\`\`\`
npm install
npm start
\`\`\`
Open http://localhost:3000 in two browser tabs for 2-player mode.
`;

// ─── Scaffolder ──────────────────────────────────────────────────────────────

export async function scaffoldDemoProject(): Promise<string> {
  devLog('fs', 'Scaffolder: isTauri check', { isTauri: isTauri() });

  if (!isTauri()) {
    devLog('fs', 'Scaffolder: not in Tauri — returning mock path');
    return '/mock/projects/pong-demo';
  }

  const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
  const { homeDir } = await import('@tauri-apps/api/path');

  const home = (await homeDir()).replace(/\/+$/, '');
  const projectPath = `${home}/projects/pong-demo`;
  devLog('fs', `Scaffolder: writing to ${projectPath}`);

  // Create project directory tree
  const dirExists = await exists(projectPath);
  if (!dirExists) {
    await mkdir(projectPath, { recursive: true });
  }
  devLog('fs', 'Scaffolder: directory created');

  // Write template files
  await writeTextFile(`${projectPath}/package.json`, packageJson);
  await writeTextFile(`${projectPath}/server.js`, serverJs);
  await writeTextFile(`${projectPath}/index.html`, indexHtml);
  devLog('fs', 'Scaffolder: template files written');

  // Create .claude/CLAUDE.md
  const claudeDir = `${projectPath}/.claude`;
  const claudeDirExists = await exists(claudeDir);
  if (!claudeDirExists) {
    await mkdir(claudeDir, { recursive: true });
  }
  await writeTextFile(`${claudeDir}/CLAUDE.md`, CLAUDE_MD);
  devLog('fs', 'Scaffolder: CLAUDE.md written');

  // Create .deckforge/project.json with pre-filled config
  const config = createDefaultProjectConfig(projectPath, 'pong-demo', 'template');
  config.tech_stack = {
    type_detected: 'node',
    framework: 'express',
    build_tool: 'npm',
    language: 'javascript',
    dependencies: ['express', 'ws'],
    detected_at: new Date().toISOString(),
  };
  config.run_config = {
    command: 'node server.js',
    auto_detected: false,
    detection_source: 'template',
    working_directory: projectPath,
    env_vars: {},
    port: 3000,
    window_class: '',
  };
  await saveProjectConfig(projectPath, config);
  devLog('fs', 'Scaffolder: project config saved');

  // Run npm install
  devLog('fs', 'Scaffolder: running npm install');
  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const cmd = Command.create('sh', ['-c', 'npm install'], { cwd: projectPath });
    const output = await cmd.execute();
    if (output.code !== 0) {
      devError('fs', `Scaffolder: npm install exited with code ${output.code}`, output.stderr);
    } else {
      devLog('fs', 'Scaffolder: npm install complete');
    }
  } catch (e) {
    devError('fs', 'Scaffolder: npm install failed (non-fatal)', e);
  }

  devLog('fs', `Scaffolder: complete at ${projectPath}`);
  return projectPath;
}
