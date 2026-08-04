// Precios actuales de Claude (actualizar según Anthropic)
const PRICING = {
  "claude-sonnet-4-6": {
    input: 3 / 1_000_000,      // $3 por 1M input tokens
    output: 15 / 1_000_000     // $15 por 1M output tokens
  },
  "claude-opus-4-1": {
    input: 15 / 1_000_000,
    output: 75 / 1_000_000
  },
  "claude-sonnet-5": {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000
  },
  "claude-opus-5": {
    input: 15 / 1_000_000,
    output: 75 / 1_000_000
  }
};

export function calculateCost(model, inputTokens, outputTokens) {
  const rates = PRICING[model] || PRICING["claude-sonnet-4-6"];
  const inputCost = inputTokens * rates.input;
  const outputCost = outputTokens * rates.output;

  return {
    input: parseFloat(inputCost.toFixed(6)),
    output: parseFloat(outputCost.toFixed(6)),
    total: parseFloat((inputCost + outputCost).toFixed(6))
  };
}

export function getModelDisplayName(model) {
  return model || "claude-sonnet-4-6";
}
