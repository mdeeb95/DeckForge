import type { ProjectConfig } from '../types/data';

/**
 * Generate the content of .claude/CLAUDE.md for a project.
 * Claude Code reads this file on every session to understand project context.
 */
export function generateClaudeMd(config: ProjectConfig): string {
  const lines: string[] = [];

  lines.push(`# Project: ${config.project.name}`);
  lines.push('');

  // Build & Run section
  lines.push('## Build & Run');
  if (config.run_config.command) {
    lines.push(`- Run: \`${config.run_config.command}\``);
  }
  if (config.tech_stack.build_tool) {
    lines.push(`- Build tool: ${config.tech_stack.build_tool}`);
  }
  if (config.run_config.working_directory && config.run_config.working_directory !== '.') {
    lines.push(`- Working directory: ${config.run_config.working_directory}`);
  }
  if (!config.run_config.command && !config.tech_stack.build_tool) {
    lines.push('- (not yet configured)');
  }
  lines.push('');

  // Tech Stack section
  lines.push('## Tech Stack');
  if (config.tech_stack.framework) {
    lines.push(`- Framework: ${config.tech_stack.framework}`);
  }
  if (config.tech_stack.language) {
    lines.push(`- Language: ${config.tech_stack.language}`);
  }
  if (config.tech_stack.dependencies.length > 0) {
    lines.push(`- Dependencies: ${config.tech_stack.dependencies.join(', ')}`);
  }
  if (config.tech_stack.type_detected !== 'unknown') {
    lines.push(`- Project type: ${config.tech_stack.type_detected}`);
  }
  if (!config.tech_stack.framework && !config.tech_stack.language) {
    lines.push('- (not yet detected)');
  }
  lines.push('');

  // Conventions section
  lines.push('## Conventions');
  lines.push('- Follow existing code patterns and naming conventions');
  lines.push('- Keep changes focused and minimal');
  lines.push('');

  // DeckForge Context section
  lines.push('## DeckForge Context');
  lines.push('This project is managed via DeckForge (gamepad interface).');
  lines.push('The user strongly prefers not to type — handle everything yourself.');
  lines.push('Provide clear progress updates.');
  lines.push('Auto-commit after completing each task with a descriptive message.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Write the CLAUDE.md file to the project's .claude directory.
 * Only works in Tauri; no-ops in browser dev mode.
 */
export async function writeClaudeMd(
  projectPath: string,
  config: ProjectConfig,
): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    console.log('[claudeMd] Not in Tauri, skipping CLAUDE.md write');
    return;
  }

  try {
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');

    const claudeDir = `${projectPath}/.claude`;
    const dirExists = await exists(claudeDir);
    if (!dirExists) {
      await mkdir(claudeDir, { recursive: true });
    }

    const content = generateClaudeMd(config);
    await writeTextFile(`${claudeDir}/CLAUDE.md`, content);
  } catch (error) {
    console.error('Failed to write CLAUDE.md:', error);
  }
}
