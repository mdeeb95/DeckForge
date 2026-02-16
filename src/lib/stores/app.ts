import { writable } from 'svelte/store';

export const currentScreen = writable('level1');
export const projectName = writable('');
export const connected = writable(false);
