<script lang="ts">
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';

  const cards = [
    { button: 'A', title: 'Send as Prompt', description: 'Submit this transcription as your request to Claude Code.', pill: 'Confirm' },
    { button: 'B', title: 'Cancel', description: 'Discard the recording and go back.', pill: 'Discard' },
    { button: 'X', title: 'Edit Text', description: 'Open a text editor to refine the transcription before sending.', pill: 'Refine' },
    { button: 'Y', title: 'Re-record', description: 'Start over with a fresh recording.', pill: 'Retry' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description })));

  const waveformBars = Array.from({ length: 15 }, (_, i) => i);
</script>

<svelte:head>
  <style>
    @keyframes wave {
      0%, 100% { height: 8px; }
      25% { height: 20px; }
      50% { height: 32px; }
      75% { height: 16px; }
    }
    .waveform-bar {
      animation: wave 0.8s ease-in-out infinite;
    }
    .waveform-bar:nth-child(1) { animation-delay: 0s; }
    .waveform-bar:nth-child(2) { animation-delay: 0.1s; }
    .waveform-bar:nth-child(3) { animation-delay: 0.2s; }
    .waveform-bar:nth-child(4) { animation-delay: 0.3s; }
    .waveform-bar:nth-child(5) { animation-delay: 0.4s; }
    .waveform-bar:nth-child(6) { animation-delay: 0.5s; }
    .waveform-bar:nth-child(7) { animation-delay: 0.6s; }
    .waveform-bar:nth-child(8) { animation-delay: 0.1s; }
    .waveform-bar:nth-child(9) { animation-delay: 0.2s; }
    .waveform-bar:nth-child(10) { animation-delay: 0.3s; }
    .waveform-bar:nth-child(11) { animation-delay: 0.4s; }
    .waveform-bar:nth-child(12) { animation-delay: 0.5s; }
    .waveform-bar:nth-child(13) { animation-delay: 0.6s; }
    .waveform-bar:nth-child(14) { animation-delay: 0.1s; }
    .waveform-bar:nth-child(15) { animation-delay: 0.2s; }
  </style>
</svelte:head>

<div class="flex-1 overflow-hidden bg-background-dark">
<div class="h-full flex flex-col items-center justify-center relative">
  <!-- Header -->
  <div class="text-center mb-6">
    <h1 class="text-xs font-bold text-primary uppercase tracking-widest mb-1">Voice Input</h1>
    <p class="text-xs text-slate-500">Speak your request — release LB to finish</p>
  </div>

  <!-- Recording Indicator -->
  <div class="flex flex-col items-center gap-3 mb-6">
    <!-- Waveform bars -->
    <div class="flex items-center justify-center gap-1 h-12">
      {#each waveformBars as _, i}
        <div class="w-1 rounded-full bg-primary waveform-bar"></div>
      {/each}
    </div>

    <!-- Recording label and dot -->
    <div class="flex items-center gap-2">
      <span class="text-primary font-mono text-sm animate-pulse">Recording...</span>
      <div class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
    </div>

    <!-- Duration -->
    <div class="text-xs text-slate-400 font-mono">0:04</div>
  </div>

  <!-- Transcription Area -->
  <div class="bg-surface-dark border border-surface-border rounded p-4 max-w-lg mx-auto mb-6">
    <div class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Transcription</div>
    <div class="text-sm text-slate-200 leading-relaxed mb-1">
      I want to add a dark mode toggle to the settings page. It should persist the preference in local storage and<span class="w-2 h-4 bg-primary inline-block animate-pulse ml-1"></span>
    </div>
    <div class="text-[10px] text-slate-500 font-mono">Words: 24 · Confidence: 94%</div>
  </div>

  <!-- Action Cards -->
  <div class="flex flex-col gap-2 max-w-lg mx-auto w-full px-4">
    {#each cards as card, i}
      {#if i === $selectedCardIndex}
        <!-- Selected card -->
        <div class="relative group cursor-pointer">
          <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
          <div class="bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
            <div class="absolute top-0 right-0 p-1.5 bg-primary text-black rounded-bl font-bold text-xs shadow-sm">{card.button}</div>
            <h3 class="text-primary font-bold text-sm mb-1 pr-6 truncate">{card.title}</h3>
            <p class="text-xs text-slate-300 leading-snug mb-2">{card.description}</p>
            <div class="flex items-center gap-2 text-[10px]">
              <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{card.pill}</span>
            </div>
          </div>
        </div>
      {:else}
        <!-- Unselected card -->
        <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
          <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative">
            <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center {i === 1 ? 'bg-secondary/20 text-secondary border border-secondary/30' : 'bg-slate-700 text-slate-300 border border-slate-600'} rounded-full font-bold text-[10px]">{card.button}</div>
            <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate">{card.title}</h3>
            <p class="text-xs text-slate-400 leading-snug mb-2">{card.description}</p>
            <div class="flex items-center gap-2 text-[10px]">
              <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">{card.pill}</span>
            </div>
          </div>
        </div>
      {/if}
    {/each}

    <!-- Separator -->
    <div class="h-px bg-surface-border my-1"></div>

    <!-- Secondary Cards -->
    <div class="relative group">
      <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">LB</div>
          <span class="text-xs text-slate-300 font-medium">Language: English</span>
        </div>
        <span class="material-icons text-slate-500 text-sm">language</span>
      </div>
    </div>
    <div class="relative group">
      <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">RB</div>
          <span class="text-xs text-slate-300 font-medium">Voice Settings</span>
        </div>
        <span class="material-icons text-slate-500 text-sm">tune</span>
      </div>
    </div>
  </div>
</div>
</div>
