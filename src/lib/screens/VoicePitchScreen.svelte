<script lang="ts">
  import { selectedCardIndex, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { voiceState } from '../stores/voice';
  import { startListening, stopListening, resetVoice, isWebSpeechAvailable } from '../system/voice';
  import { onDestroy } from 'svelte';

  // Reactive aliases
  $: recording = $voiceState.recording;
  $: transcript = $voiceState.transcript;
  $: interimTranscript = $voiceState.interimTranscript;
  $: confidence = $voiceState.confidence;
  $: error = $voiceState.error;
  $: hasTranscript = transcript.length > 0;
  $: displayText = transcript || interimTranscript;
  $: wordCount = displayText.trim() ? displayText.trim().split(/\s+/).length : 0;
  $: confidencePct = Math.round(confidence * 100);

  // Determine phase: 'idle' | 'recording' | 'done'
  $: phase = recording ? 'recording' : hasTranscript ? 'done' : 'idle';

  // Build dynamic cards based on phase
  $: {
    let cards: Array<{ button: string; title: string; description: string }>;
    if (phase === 'idle') {
      cards = [
        { button: 'A', title: 'Start Recording', description: 'Press to begin voice input. Speak your request clearly.' },
        { button: 'B', title: 'Back', description: 'Return to the previous screen.' },
      ];
    } else if (phase === 'recording') {
      cards = [
        { button: 'A', title: 'Stop Recording', description: 'Finish recording and process the transcription.' },
        { button: 'B', title: 'Cancel', description: 'Cancel this recording and discard audio.' },
      ];
    } else {
      cards = [
        { button: 'A', title: 'Send as Prompt', description: 'Submit this transcription as your request to Claude Code.' },
        { button: 'B', title: 'Clear & Re-record', description: 'Discard this transcription and start a new recording.' },
        { button: 'Y', title: 'Re-record', description: 'Start over with a fresh recording.' },
      ];
    }
    screenCards.set(cards.map(c => ({
      button: c.button,
      title: c.title,
      description: c.description,
      onclick: () => handleAction(c.button),
    })));
  }

  function handleAction(button: string) {
    if (phase === 'idle') {
      if (button === 'A') startListening();
      if (button === 'B') navigate('project_select');
    } else if (phase === 'recording') {
      if (button === 'A') stopListening();
      if (button === 'B') { resetVoice(); }
    } else {
      // done
      if (button === 'A') {
        pendingClaudePrompt.set(transcript);
        resetVoice();
        navigate('ai_working');
      }
      if (button === 'B' || button === 'Y') {
        resetVoice();
      }
    }
  }

  const webSpeechOk = isWebSpeechAvailable();
  const waveformBars = Array.from({ length: 15 }, (_, i) => i);

  // Cleanup on unmount
  onDestroy(() => {
    if ($voiceState.recording) stopListening();
  });
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
    .waveform-bar-idle {
      height: 4px;
    }
  </style>
</svelte:head>

<div class="flex-1 overflow-hidden bg-background-dark">
<div class="h-full flex flex-col items-center justify-center relative">
  <!-- Header -->
  <div class="text-center mb-6">
    <h1 class="text-xs font-bold text-primary uppercase tracking-widest mb-1">Voice Input</h1>
    <p class="text-xs text-slate-500">
      {#if phase === 'idle'}
        Press A to start recording
      {:else if phase === 'recording'}
        Listening... press A to stop
      {:else}
        Review your transcription below
      {/if}
    </p>
  </div>

  <!-- Waveform / Status Area -->
  <div class="flex flex-col items-center gap-3 mb-6">
    {#if phase === 'recording'}
      <!-- Animated waveform bars -->
      <div class="flex items-center justify-center gap-1 h-12">
        {#each waveformBars as _, i}
          <div class="w-1 rounded-full bg-primary waveform-bar"></div>
        {/each}
      </div>
      <div class="flex items-center gap-2">
        <span class="text-primary font-mono text-sm animate-pulse">Recording...</span>
        <div class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
      </div>
    {:else if phase === 'idle'}
      <!-- Idle waveform (flat bars) -->
      <div class="flex items-center justify-center gap-1 h-12">
        {#each waveformBars as _}
          <div class="w-1 rounded-full bg-slate-600 waveform-bar-idle"></div>
        {/each}
      </div>
      {#if !webSpeechOk}
        <div class="text-xs text-red-400 font-mono">Speech recognition not available</div>
      {:else}
        <div class="text-xs text-slate-500 font-mono">Ready</div>
      {/if}
    {:else}
      <!-- Done — checkmark -->
      <div class="flex items-center justify-center h-12">
        <span class="material-icons text-primary text-3xl">check_circle</span>
      </div>
      <div class="text-xs text-primary font-mono">Transcription complete</div>
    {/if}
  </div>

  <!-- Transcription Area -->
  {#if displayText || error}
    <div class="bg-surface-dark border border-surface-border rounded p-4 max-w-lg mx-auto mb-6">
      <div class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Transcription</div>
      {#if error}
        <div class="text-sm text-red-400 leading-relaxed">{error}</div>
      {:else}
        <div class="text-sm text-slate-200 leading-relaxed mb-1">
          {transcript}{#if interimTranscript}<span class="text-slate-400">{interimTranscript}</span>{/if}{#if recording}<span class="w-2 h-4 bg-primary inline-block animate-pulse ml-1"></span>{/if}
        </div>
        <div class="text-[10px] text-slate-500 font-mono">
          Words: {wordCount}{#if confidencePct > 0} &middot; Confidence: {confidencePct}%{/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Action Cards -->
  <div class="flex flex-col gap-2 max-w-lg mx-auto w-full px-4">
    {#each $screenCards as card, i}
      {#if i === $selectedCardIndex}
        <!-- Selected card -->
        <div class="relative group cursor-pointer">
          <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
          <div class="bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
            <div class="absolute top-0 right-0 p-1.5 bg-primary text-black rounded-bl font-bold text-xs shadow-sm">{card.button}</div>
            <h3 class="text-primary font-bold text-sm mb-1 pr-6 truncate">{card.title}</h3>
            <p class="text-xs text-slate-300 leading-snug mb-2">{card.description}</p>
          </div>
        </div>
      {:else}
        <!-- Unselected card -->
        <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
          <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative">
            <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-slate-700 text-slate-300 border border-slate-600 rounded-full font-bold text-[10px]">{card.button}</div>
            <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate">{card.title}</h3>
            <p class="text-xs text-slate-400 leading-snug mb-2">{card.description}</p>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
</div>
