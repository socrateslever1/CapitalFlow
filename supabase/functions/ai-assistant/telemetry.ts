export type CacheHitKind = 'none' | 'query' | 'prompt';

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

export type TraceSpan = {
  name: string;
  durationMs: number;
  status: 'ok' | 'error';
  meta?: Record<string, string | number | boolean>;
};

export type TelemetrySummary = {
  traceId: string;
  latencyMs: number;
  steps: number;
  toolsCalled: string[];
  cacheHit: CacheHitKind;
  provider: string;
  model: string;
  tokens: TokenUsage;
  costEstimateUsd: number;
  spans: TraceSpan[];
};

const MODEL_RATE_PER_1M_USD: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /gemini-2\.5-flash|gemini-2\.0-flash|gemini-3/i, input: 0.15, output: 0.6 },
  { match: /gpt-4o-mini/i, input: 0.15, output: 0.6 },
  { match: /deepseek/i, input: 0.27, output: 1.1 },
  { match: /llama|mistral|openrouter/i, input: 0.1, output: 0.3 },
];

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  if (/fallback|unavailable|policy/i.test(model)) return 0;
  const rate = MODEL_RATE_PER_1M_USD.find(item => item.match.test(model)) || { input: 0.15, output: 0.6 };
  const billablePrompt = Math.max(0, usage.promptTokens - usage.cachedTokens * 0.75);
  const cost = (billablePrompt / 1_000_000) * rate.input + (usage.completionTokens / 1_000_000) * rate.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export class FluxTracer {
  readonly traceId: string;
  private readonly startedAt: number;
  private readonly spans: TraceSpan[] = [];
  private readonly toolsCalled: string[] = [];
  private steps = 0;
  private cacheHit: CacheHitKind = 'none';
  private provider = 'flux-safe';
  private model = 'unavailable';
  private tokens: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    totalTokens: 0,
  };

  constructor(traceId?: string) {
    this.traceId = traceId && traceId.trim() ? traceId.trim() : crypto.randomUUID();
    this.startedAt = performance.now();
  }

  startSpan(name: string, meta?: Record<string, string | number | boolean>) {
    const t0 = performance.now();
    return {
      end: (status: 'ok' | 'error' = 'ok', extraMeta?: Record<string, string | number | boolean>) => {
        this.spans.push({
          name,
          durationMs: Math.round((performance.now() - t0) * 100) / 100,
          status,
          ...(meta || extraMeta ? { meta: { ...meta, ...extraMeta } } : {}),
        });
      },
    };
  }

  recordStep() {
    this.steps += 1;
  }

  recordToolCall(toolName: string) {
    if (!this.toolsCalled.includes(toolName)) {
      this.toolsCalled.push(toolName);
    }
  }

  recordCacheHit(kind: CacheHitKind) {
    // Prompt cache takes precedence over query cache in reporting.
    if (kind === 'prompt' || (kind === 'query' && this.cacheHit === 'none')) {
      this.cacheHit = kind;
    }
  }

  recordProvider(provider: string, model: string) {
    this.provider = provider;
    this.model = model;
  }

  recordTokens(partial: Partial<TokenUsage>) {
    const promptTokens = Math.max(0, Math.round(partial.promptTokens || 0));
    const completionTokens = Math.max(0, Math.round(partial.completionTokens || 0));
    const cachedTokens = Math.max(0, Math.round(partial.cachedTokens || 0));
    this.tokens.promptTokens += promptTokens;
    this.tokens.completionTokens += completionTokens;
    this.tokens.cachedTokens += cachedTokens;
    this.tokens.totalTokens = this.tokens.promptTokens + this.tokens.completionTokens;
  }

  toSummary(): TelemetrySummary {
    return {
      traceId: this.traceId,
      latencyMs: Math.round((performance.now() - this.startedAt) * 100) / 100,
      steps: this.steps,
      toolsCalled: [...this.toolsCalled],
      cacheHit: this.cacheHit,
      provider: this.provider,
      model: this.model,
      tokens: { ...this.tokens },
      costEstimateUsd: estimateCostUsd(this.model, this.tokens),
      spans: [...this.spans],
    };
  }

  emitStructuredLog(status: 'ok' | 'blocked' | 'error') {
    const summary = this.toSummary();
    console.info(
      JSON.stringify({
        event: 'flux.trace',
        status,
        traceId: summary.traceId,
        latencyMs: summary.latencyMs,
        steps: summary.steps,
        toolsCalled: summary.toolsCalled,
        cacheHit: summary.cacheHit,
        provider: summary.provider,
        model: summary.model,
        tokens: summary.tokens,
        costEstimateUsd: summary.costEstimateUsd,
      }),
    );
  }
}

