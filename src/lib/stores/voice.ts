import { writable } from 'svelte/store';

export interface VoiceState {
  recording: boolean;
  transcript: string;
  interimTranscript: string;
  confidence: number;
  error: string | null;
}

export const voiceState = writable<VoiceState>({
  recording: false,
  transcript: '',
  interimTranscript: '',
  confidence: 0,
  error: null,
});
