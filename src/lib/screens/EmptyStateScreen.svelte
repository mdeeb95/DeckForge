<script lang="ts">
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';

  screenCards.set([
    { button: 'A', title: 'Open Directory', description: 'Browse and select a project folder from your filesystem.' },
    { button: 'B', title: 'Paste a Path', description: 'Enter a full path to your project directory.' },
    { button: 'X', title: 'Clone from Git', description: 'Clone a repository from a Git URL.' },
    { button: 'Y', title: 'Demo Mode', description: 'Try DeckForge with a sample project.' },
  ]);
</script>

<div class="flex-1 overflow-hidden bg-background-dark">
<div class="h-full flex items-center justify-center relative">
  <div class="flex flex-col items-center justify-center max-w-sm text-center">
    <!-- Logo -->
    <div class="mb-6">
      <span class="material-icons text-primary drop-shadow-[0_0_10px_rgba(13,242,242,0.3)]" style="font-size: 48px;">terminal</span>
      <h1 class="text-primary font-bold text-2xl font-mono tracking-wide mb-1">DeckForge</h1>
      <span class="text-[10px] text-slate-500 font-mono">v0.1.0</span>
    </div>

    <!-- Message -->
    <h2 class="text-sm font-bold text-white uppercase tracking-widest mb-3">No Projects Found</h2>
    <p class="text-xs text-slate-400 leading-relaxed mb-6">Point DeckForge at a project folder to get started. Open a directory, paste a path, or clone from Git.</p>

    <!-- Action cards -->
    <div class="w-full space-y-2">
      <!-- A: Open Directory (Selected) -->
      <div class="relative group cursor-pointer">
        <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
        <div class="bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
          <div class="absolute top-0 right-0 p-1.5 bg-primary text-black rounded-bl font-bold text-xs shadow-sm">A</div>
          <h3 class="text-primary font-bold text-sm mb-1 pr-6 truncate text-left">Open Directory</h3>
          <p class="text-xs text-slate-300 leading-snug mb-2 text-left">Browse and select a project folder from your filesystem.</p>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">Recommended</span>
          </div>
        </div>
      </div>

      <!-- B: Paste Path -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
        <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative">
          <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-secondary/20 text-secondary border border-secondary/30 rounded-full font-bold text-[10px]">B</div>
          <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate text-left">Paste a Path</h3>
          <p class="text-xs text-slate-400 leading-snug mb-2 text-left">Enter a full path to your project directory.</p>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">Quick</span>
          </div>
        </div>
      </div>

      <!-- X: Clone from Git -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
        <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative">
          <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-slate-700 text-slate-300 border border-slate-600 rounded-full font-bold text-[10px]">X</div>
          <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate text-left">Clone from Git</h3>
          <p class="text-xs text-slate-400 leading-snug mb-2 text-left">Clone a repository from a Git URL.</p>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">Remote</span>
          </div>
        </div>
      </div>

      <!-- Y: Demo Mode -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
        <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative">
          <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-slate-700 text-slate-300 border border-slate-600 rounded-full font-bold text-[10px]">Y</div>
          <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate text-left">Demo Mode</h3>
          <p class="text-xs text-slate-400 leading-snug mb-2 text-left">Try DeckForge with a sample project.</p>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">Try it</span>
          </div>
        </div>
      </div>

      <div class="h-px bg-surface-border my-3 w-full"></div>

      <div class="relative group">
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">LB</div>
            <span class="text-xs text-slate-300 font-medium">Settings</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">settings</span>
        </div>
      </div>
      <div class="relative group">
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">RB</div>
            <span class="text-xs text-slate-300 font-medium">Help</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">help_outline</span>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
