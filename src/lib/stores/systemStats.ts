import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

interface SystemStats {
  cpu: number;
  ram: number;
}

export const cpuUsage = writable<number>(0);
export const ramUsage = writable<number>(0);

let intervalId: ReturnType<typeof setInterval> | null = null;

async function fetchStats() {
  try {
    const stats = await invoke<SystemStats>('get_system_stats');
    cpuUsage.set(stats.cpu);
    ramUsage.set(stats.ram);
  } catch (e) {
    console.error('Failed to fetch system stats:', e);
  }
}

export function startSystemStatsPolling(intervalMs = 2000) {
  if (intervalId !== null) return;
  fetchStats();
  intervalId = setInterval(fetchStats, intervalMs);
}

export function stopSystemStatsPolling() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
