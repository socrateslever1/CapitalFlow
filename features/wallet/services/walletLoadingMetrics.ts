export type WalletLoadTarget = 'overview' | 'snapshot';
export type WalletLoadSource = 'memory' | 'offline' | 'network';

export interface WalletLoadSample {
  target: WalletLoadTarget;
  source: WalletLoadSource;
  durationMs: number;
  recordedAt: number;
}

export interface WalletLoadingSummary {
  count: number;
  avgMs: number;
  maxMs: number;
  lastMs: number;
  lastSource: WalletLoadSource;
  cacheHitRatePercent: number;
}

const MAX_SAMPLES = 30;
const samples: WalletLoadSample[] = [];
const listeners = new Set<() => void>();

export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function recordWalletLoadSample(input: {
  target: WalletLoadTarget;
  source: WalletLoadSource;
  durationMs: number;
}): void {
  const safeDuration = Number.isFinite(input.durationMs) && input.durationMs >= 0
    ? Math.round(input.durationMs * 10) / 10
    : 0;
  samples.push({
    target: input.target,
    source: input.source,
    durationMs: safeDuration,
    recordedAt: Date.now(),
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
  listeners.forEach(listener => listener());
}

export function getWalletLoadingSummary(): WalletLoadingSummary | null {
  if (!samples.length) return null;
  let totalMs = 0;
  let maxMs = 0;
  let cacheHits = 0;
  for (const sample of samples) {
    totalMs += sample.durationMs;
    if (sample.durationMs > maxMs) maxMs = sample.durationMs;
    if (sample.source === 'memory' || sample.source === 'offline') cacheHits += 1;
  }
  const last = samples[samples.length - 1];
  return {
    count: samples.length,
    avgMs: Math.round(totalMs / samples.length),
    maxMs: Math.round(maxMs),
    lastMs: Math.round(last.durationMs),
    lastSource: last.source,
    cacheHitRatePercent: Math.round((cacheHits / samples.length) * 100),
  };
}

export function clearWalletLoadingMetrics(): void {
  samples.length = 0;
  listeners.forEach(listener => listener());
}

export function subscribeWalletLoadingMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
