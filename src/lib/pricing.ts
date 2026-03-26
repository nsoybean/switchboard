/** Per-million-token pricing by model prefix */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4": { input: 15, output: 75 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4": { input: 0.8, output: 4 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-3-opus": { input: 15, output: 75 },
};

const DEFAULT_PRICING = { input: 3, output: 15 };

function getPricing(model: string | null): { input: number; output: number } {
  if (!model) return DEFAULT_PRICING;
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) return pricing;
  }
  return DEFAULT_PRICING;
}

/** Estimate cost in USD */
export function estimateCost(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getPricing(model);
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

/** Format token count for display (e.g., 1234 → "1.2k") */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** Format cost for display */
export function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}
