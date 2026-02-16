<script lang="ts">
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';

  const messages = [
    {
      role: 'user' as const,
      text: 'How is authentication handled in this project? I want to understand the flow before adding OAuth.',
    },
    {
      role: 'claude' as const,
      text: 'The auth system uses JWT tokens stored in httpOnly cookies. The flow goes: LoginForm → /api/auth/login → validates against bcrypt hash → signs JWT → sets cookie. Token refresh happens in middleware. The relevant files are:',
      files: ['src/middleware/auth.ts', 'src/routes/auth/login.ts', 'src/lib/jwt.ts'],
    },
    {
      role: 'user' as const,
      text: 'What would need to change to support OAuth alongside the existing JWT flow?',
    },
    {
      role: 'claude' as const,
      text: 'To add OAuth support alongside JWT, you\'d need to...',
      streaming: true,
    },
  ];

  const contextFiles = [
    { path: 'src/middleware/auth.ts', desc: 'JWT verification middleware' },
    { path: 'src/routes/auth/login.ts', desc: 'Login endpoint handler' },
    { path: 'src/lib/jwt.ts', desc: 'Token signing and refresh' },
    { path: 'src/types/auth.d.ts', desc: 'Auth type definitions' },
    { path: 'package.json', desc: 'Dependencies: jsonwebtoken, bcrypt' },
  ];

  const actionCards = [
    { button: 'A', label: 'Ask Follow-up', borderClass: 'border-primary/30 hover:border-primary/50', textClass: 'text-primary' },
    { button: 'B', label: 'Go Back', borderClass: 'border-secondary/30 hover:border-secondary/50', textClass: 'text-secondary' },
    { button: 'X', label: 'Save to Notes', borderClass: 'border-slate-600 hover:border-slate-500', textClass: 'text-slate-300' },
    { button: 'Y', label: 'Start Task from This', borderClass: 'border-slate-600 hover:border-slate-500', textClass: 'text-slate-300' },
  ];

  screenCards.set(actionCards.map(c => ({ button: c.button, title: c.label, description: c.label })));
</script>

<!-- Left: Conversation Area -->
<section class="flex-1 flex flex-col min-w-0 overflow-hidden">
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-xs font-bold text-primary uppercase tracking-widest mb-1">Exploration Mode</h1>
      <p class="text-xs text-slate-500">Ask anything about your codebase</p>
    </div>

    <!-- Conversation Thread -->
    <div class="space-y-6 max-w-3xl">
      {#each messages as msg}
        {#if msg.role === 'user'}
          <div class="pl-3 border-l-2 border-primary/50">
            <div class="text-primary font-bold text-[10px] uppercase tracking-wider mb-2">User</div>
            <p class="text-sm text-slate-200">{msg.text}</p>
          </div>
        {:else}
          <div class="pl-3 border-l-2 border-secondary/30">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-secondary font-bold text-[10px] uppercase tracking-wider">Claude</span>
              {#if msg.streaming}
                <span class="bg-secondary/20 text-secondary border border-secondary/30 text-[10px] rounded px-1.5 py-0.5">Thinking</span>
              {/if}
            </div>
            <p class="text-xs text-slate-300 leading-relaxed mb-3">
              {msg.text}
              {#if msg.streaming}
                <span class="w-2 h-4 bg-primary animate-pulse inline-block ml-1"></span>
              {/if}
            </p>
            {#if msg.files}
              <div class="bg-[#0b0e11] border border-surface-border rounded p-2 text-[10px] font-mono space-y-1">
                {#each msg.files as file}
                  <div class="text-primary">{file}</div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Action Cards (Bottom) -->
  <div class="border-t border-surface-border bg-background-dark/50 p-4">
    <div class="flex items-center justify-center gap-3">
      {#each actionCards as card}
        <div class="bg-surface-dark border {card.borderClass} p-2 rounded cursor-pointer transition-colors">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold {card.textClass}">{card.button}</span>
            <span class="text-[10px] text-slate-300">{card.label}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Right: Context Sidebar -->
<aside class="w-[35%] border-l border-surface-border bg-surface-dark flex flex-col shrink-0">
  <!-- Context Header -->
  <div class="p-3 border-b border-surface-border">
    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Context</h2>
  </div>

  <!-- File Cards -->
  <div class="flex-1 overflow-hidden min-h-0 p-3 space-y-1.5">
    {#each contextFiles as file}
      <div class="bg-background-dark border border-surface-border p-2 rounded">
        <div class="text-[10px] font-mono text-primary truncate">{file.path}</div>
        <div class="text-[10px] text-slate-500">{file.desc}</div>
      </div>
    {/each}

    <!-- Separator -->
    <div class="h-px bg-surface-border my-2"></div>

    <!-- Token Usage -->
    <div>
      <div class="text-[10px] text-slate-500 font-bold uppercase mb-1">Token Usage</div>
      <div class="text-xs text-slate-300 font-mono mb-2">2,847 tokens</div>
      <div class="flex items-center gap-2 mb-1">
        <div class="flex-1 bg-slate-800 rounded-full h-1">
          <div class="bg-primary rounded-full h-1 w-[35%]"></div>
        </div>
      </div>
      <div class="text-[10px] text-slate-500">35% of context window</div>
    </div>
  </div>
</aside>
