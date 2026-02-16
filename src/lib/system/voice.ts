// ─── Voice Input — Web Speech API wrapper with whisper.cpp stub ─────────────

import { voiceState } from '../stores/voice';

// Web Speech API types (not in all TS lib configs)
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLike {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let recognition: SpeechRecognitionInstance | null = null;

/**
 * Check if Web Speech API is available in this browser/webview.
 */
export function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

/**
 * Get the SpeechRecognition constructor (handles webkit prefix).
 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null;
}

/**
 * Start listening for voice input via Web Speech API.
 */
export function startListening(): void {
  const SpeechRecognitionCtor = getSpeechRecognition();

  if (!SpeechRecognitionCtor) {
    voiceState.update(s => ({
      ...s,
      error: 'Speech recognition not available in this browser',
    }));
    console.warn('[voice] Web Speech API not available');
    return;
  }

  // Stop any existing session
  if (recognition) {
    try { recognition.abort(); } catch { /* ignore */ }
  }

  recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  voiceState.set({
    recording: true,
    transcript: '',
    interimTranscript: '',
    confidence: 0,
    error: null,
  });

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    let interim = '';
    let final = '';
    let bestConfidence = 0;

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        final += result[0].transcript;
        bestConfidence = Math.max(bestConfidence, result[0].confidence);
      } else {
        interim += result[0].transcript;
      }
    }

    voiceState.update(s => ({
      ...s,
      transcript: final || s.transcript,
      interimTranscript: interim,
      confidence: bestConfidence > 0 ? bestConfidence : s.confidence,
    }));
  };

  recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
    console.error('[voice] Recognition error:', event.error);
    voiceState.update(s => ({
      ...s,
      recording: false,
      error: `Speech error: ${event.error}`,
    }));
    recognition = null;
  };

  recognition.onend = () => {
    voiceState.update(s => ({
      ...s,
      recording: false,
    }));
    recognition = null;
  };

  try {
    recognition.start();
    console.log('[voice] Started listening');
  } catch (error) {
    console.error('[voice] Failed to start:', error);
    voiceState.update(s => ({
      ...s,
      recording: false,
      error: 'Failed to start speech recognition',
    }));
    recognition = null;
  }
}

/**
 * Stop listening and finalize the transcript.
 */
export function stopListening(): void {
  if (recognition) {
    try {
      recognition.stop();
    } catch { /* ignore */ }
    recognition = null;
  }
  voiceState.update(s => ({
    ...s,
    recording: false,
    // Move interim to final transcript if we have interim but no final
    transcript: s.transcript || s.interimTranscript,
    interimTranscript: '',
  }));
  console.log('[voice] Stopped listening');
}

/**
 * Reset voice state to initial values.
 */
export function resetVoice(): void {
  if (recognition) {
    try { recognition.abort(); } catch { /* ignore */ }
    recognition = null;
  }
  voiceState.set({
    recording: false,
    transcript: '',
    interimTranscript: '',
    confidence: 0,
    error: null,
  });
}

// ─── Whisper.cpp stub (future Tauri-only path) ──────────────────────────────
// When whisper.cpp is available:
// 1. Record via `arecord -f S16_LE -r 16000 -c 1 /tmp/deckforge-voice.wav` (Linux)
//    or `rec /tmp/deckforge-voice.wav rate 16k channels 1` (macOS/sox)
// 2. Run `whisper /tmp/deckforge-voice.wav --model base.en --output-txt`
// 3. Parse stdout for transcription text
// For now, Web Speech API is the working path for development.
