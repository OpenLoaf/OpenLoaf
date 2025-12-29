import type { ModelDefinition, PriceResult, PriceTier, PricingStrategy, Usage } from "./modelTypes";

export const PRICE_STRATEGY_TIERED_TOKEN = "tiered_token";
const PRICE_PER_MILLION = 1_000_000;

/** Resolve the best price tier by context size. */
export function resolvePriceTier(definition: ModelDefinition, contextK: number): PriceTier | null {
  const tiers = Array.isArray(definition.priceTiers) ? definition.priceTiers : [];
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minContextK - b.minContextK);
  let matched = sorted[0] ?? null;
  for (const tier of sorted) {
    // 中文注释：选择 minContextK 小于等于当前上下文的最高档位。
    if (contextK >= tier.minContextK) matched = tier;
  }
  return matched;
}

/** Estimate token-based cost for tiered pricing. */
export function estimateTieredTokenPrice(
  definition: ModelDefinition,
  usage: Usage,
): PriceResult {
  const tier = resolvePriceTier(definition, usage.contextK);
  if (!tier) {
    return { inputCost: 0, inputCacheCost: 0, outputCost: 0, total: 0 };
  }
  const inputTokens = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const inputCacheTokens = Number.isFinite(usage.inputCacheTokens)
    ? usage.inputCacheTokens
    : 0;
  const outputTokens = Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0;
  const inputCost = (inputTokens * tier.input) / PRICE_PER_MILLION;
  const inputCacheCost = (inputCacheTokens * tier.inputCache) / PRICE_PER_MILLION;
  const outputCost = (outputTokens * tier.output) / PRICE_PER_MILLION;
  return {
    inputCost,
    inputCacheCost,
    outputCost,
    total: inputCost + inputCacheCost + outputCost,
  };
}

export const TIERED_TOKEN_PRICING_STRATEGY: PricingStrategy = {
  id: PRICE_STRATEGY_TIERED_TOKEN,
  estimate: estimateTieredTokenPrice,
};

const PRICING_STRATEGIES: Record<string, PricingStrategy> = {
  [PRICE_STRATEGY_TIERED_TOKEN]: TIERED_TOKEN_PRICING_STRATEGY,
};

/** Estimate price using model's strategy id. */
export function estimateModelPrice(definition: ModelDefinition, usage: Usage): PriceResult | null {
  const strategy = PRICING_STRATEGIES[definition.priceStrategyId];
  if (!strategy) return null;
  return strategy.estimate(definition, usage);
}
