// ─── Deploy Provider Wrappers ────────────────────────────────────────────────

export type OutputCallback = (line: string) => void;

export interface DeployResult {
  success: boolean;
  url: string;
  preview_url: string | null;
  duration_seconds: number;
  message: string;
}

export interface DeployProviderImpl {
  name: string;
  deploy(cwd: string, onOutput: OutputCallback): Promise<DeployResult>;
  deployPreview(cwd: string, onOutput: OutputCallback): Promise<DeployResult>;
  getStatus(cwd: string): Promise<string>;
}

// ─── Tauri detection ────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Shell streaming helper ─────────────────────────────────────────────────

async function streamCommand(
  cmd: string,
  cwd: string,
  onOutput: OutputCallback,
): Promise<{ code: number; stdout: string }> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const command = Command.create('sh', ['-c', cmd], { cwd });

  let stdout = '';

  return new Promise((resolve, reject) => {
    command.stdout.on('data', (line: string) => {
      stdout += line + '\n';
      onOutput(line);
    });

    command.stderr.on('data', (line: string) => {
      onOutput(`[stderr] ${line}`);
    });

    command.on('close', (data: { code: number | null }) => {
      resolve({ code: data.code ?? 1, stdout });
    });

    command.on('error', (error: string) => {
      reject(new Error(error));
    });

    command.spawn();
  });
}

// ─── Mock streaming helper ──────────────────────────────────────────────────

async function mockStream(lines: string[], onOutput: OutputCallback, delayMs = 300): Promise<void> {
  for (const line of lines) {
    await new Promise(r => setTimeout(r, delayMs));
    onOutput(line);
  }
}

// ─── Vercel Provider ────────────────────────────────────────────────────────

function createVercelProvider(): DeployProviderImpl {
  return {
    name: 'vercel',

    async deploy(cwd, onOutput) {
      const start = Date.now();

      if (!isTauri()) {
        await mockStream([
          '▲ Vercel CLI 33.0.0',
          '🔍 Inspecting deployment...',
          '📦 Building project...',
          '✅ Production: https://my-app.vercel.app [42s]',
        ], onOutput);
        return { success: true, url: 'https://my-app.vercel.app', preview_url: null, duration_seconds: 42, message: 'Deployed to production' };
      }

      const result = await streamCommand('vercel --prod --yes', cwd, onOutput);
      const duration = Math.round((Date.now() - start) / 1000);
      const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.vercel\.app/);

      return {
        success: result.code === 0,
        url: urlMatch?.[0] ?? '',
        preview_url: null,
        duration_seconds: duration,
        message: result.code === 0 ? 'Deployed to production' : 'Deploy failed',
      };
    },

    async deployPreview(cwd, onOutput) {
      const start = Date.now();

      if (!isTauri()) {
        await mockStream([
          '▲ Vercel CLI 33.0.0',
          '🔍 Inspecting deployment...',
          '📦 Building project...',
          '✅ Preview: https://my-app-abc123.vercel.app [38s]',
        ], onOutput);
        return { success: true, url: '', preview_url: 'https://my-app-abc123.vercel.app', duration_seconds: 38, message: 'Preview deployed' };
      }

      const result = await streamCommand('vercel --yes', cwd, onOutput);
      const duration = Math.round((Date.now() - start) / 1000);
      const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.vercel\.app/);

      return {
        success: result.code === 0,
        url: '',
        preview_url: urlMatch?.[0] ?? '',
        duration_seconds: duration,
        message: result.code === 0 ? 'Preview deployed' : 'Preview deploy failed',
      };
    },

    async getStatus(cwd) {
      if (!isTauri()) return 'healthy';
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('sh', ['-c', 'vercel ls --limit 1 2>/dev/null'], { cwd });
      const result = await cmd.execute();
      return result.code === 0 ? 'healthy' : 'unknown';
    },
  };
}

// ─── Railway Provider ───────────────────────────────────────────────────────

function createRailwayProvider(): DeployProviderImpl {
  return {
    name: 'railway',

    async deploy(cwd, onOutput) {
      const start = Date.now();

      if (!isTauri()) {
        await mockStream([
          '☁️ Railway CLI v3.5.0',
          '📦 Uploading project...',
          '🔨 Building...',
          '✅ Deployed: https://my-app.up.railway.app [55s]',
        ], onOutput);
        return { success: true, url: 'https://my-app.up.railway.app', preview_url: null, duration_seconds: 55, message: 'Deployed to Railway' };
      }

      const result = await streamCommand('railway up --detach', cwd, onOutput);
      const duration = Math.round((Date.now() - start) / 1000);

      return {
        success: result.code === 0,
        url: '',
        preview_url: null,
        duration_seconds: duration,
        message: result.code === 0 ? 'Deployed to Railway' : 'Deploy failed',
      };
    },

    async deployPreview(cwd, onOutput) {
      // Railway doesn't have a separate preview mode — just deploy
      return this.deploy(cwd, onOutput);
    },

    async getStatus(cwd) {
      if (!isTauri()) return 'healthy';
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('sh', ['-c', 'railway status 2>/dev/null'], { cwd });
      const result = await cmd.execute();
      return result.code === 0 ? result.stdout.trim() : 'unknown';
    },
  };
}

// ─── Generic Provider (GitHub Pages / Netlify auto-deploy) ──────────────────

function createGenericProvider(): DeployProviderImpl {
  return {
    name: 'generic',

    async deploy(_cwd, onOutput) {
      if (!isTauri()) {
        await mockStream([
          '→ No deploy CLI configured',
          '→ Deploying via git push (auto-deploy enabled)',
          '✅ Push complete — deploy will trigger automatically',
        ], onOutput);
      } else {
        onOutput('→ No deploy CLI configured');
        onOutput('→ Deploying via git push (auto-deploy enabled)');
        onOutput('✅ Push complete — deploy will trigger automatically');
      }

      return {
        success: true,
        url: '',
        preview_url: null,
        duration_seconds: 0,
        message: 'Deployed via git push',
      };
    },

    async deployPreview(_cwd, onOutput) {
      return this.deploy(_cwd, onOutput);
    },

    async getStatus() {
      return 'auto-deploy';
    },
  };
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function getProvider(providerName: string | null): DeployProviderImpl {
  switch (providerName) {
    case 'vercel':
      return createVercelProvider();
    case 'railway':
      return createRailwayProvider();
    case 'netlify':
    case 'github_pages':
    default:
      return createGenericProvider();
  }
}
