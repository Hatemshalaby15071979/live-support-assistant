/**
 * The Confidence Gate.
 *
 * A deterministic comparison over a normalised score. There is no generative
 * component anywhere in this path: the gate either returns the matched
 * procedure together with its evidence, or it blocks the answer and hands the
 * case to a human. Nothing here synthesises, paraphrases, or guesses.
 */

import type {
  ConfidenceGateConfig,
  GateDecision,
  MatchCandidate,
  PerTenantGateConfig,
} from './types.js';

/**
 * Rank the candidates, then accept or block.
 *
 * Ranking is a stable sort by descending score, so candidates that tie keep the
 * order they arrived in. Acceptance requires both signals: the winner must clear
 * the tenant's `thresholdAccept` and must hold a gap of at least `minMargin`
 * over the runner-up. There is no review band and no fallback path.
 *
 * Two call shapes are supported:
 *  - legacy: a single `ConfidenceGateConfig` with no tenant — the simulated
 *    product and evaluation harnesses;
 *  - per-tenant: a `PerTenantGateConfig` map plus a tenant id. The tenant's own
 *    thresholds are applied. An unknown tenant fails closed: there is no global
 *    fallback that could silently override a configured tenant's threshold.
 *
 * @param candidates Scored candidates from the active scorer.
 * @param config Single-tenant config (legacy) or a per-tenant map.
 * @param tenant Tenant id when `config` is a per-tenant map.
 * @returns An acceptance carrying the winning procedure id, or a block carrying
 * the reason and the top-`k` evidence that justified it.
 */
function isPerTenant(value: unknown): value is PerTenantGateConfig {
  return typeof value === 'object' && value !== null && !('thresholdAccept' in value);
}

function resolveConfig(
  config: ConfidenceGateConfig | PerTenantGateConfig,
  tenant: string | undefined,
): ConfidenceGateConfig | null {
  if (tenant !== undefined && isPerTenant(config)) {
    const entry = config[tenant];
    return entry === undefined ? null : entry;
  }
  if (isPerTenant(config)) {
    // A map without a tenant is a misconfiguration, not a request for a default.
    return null;
  }
  return config;
}

export function evaluateGate(
  candidates: readonly MatchCandidate[],
  config: ConfidenceGateConfig | PerTenantGateConfig,
  tenant?: string,
): GateDecision {
  const resolved = resolveConfig(config, tenant);

  // No configuration resolved: unknown tenant, or a map passed without a tenant.
  // Fail closed — never fall back to a global default that could override a
  // configured tenant's threshold.
  if (resolved === null) {
    return { outcome: 'blocked', reason: 'unknown_tenant', evidence: [] };
  }

  if (
    !Number.isFinite(resolved.thresholdAccept) ||
    !Number.isFinite(resolved.minMargin) ||
    !Number.isSafeInteger(resolved.topK) ||
    resolved.topK < 1
  ) {
    return { outcome: 'blocked', reason: 'invalid_candidate', evidence: [] };
  }

  const ranked = [...candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, resolved.topK);

  if (ranked.some((candidate) => !Number.isFinite(candidate.score))) {
    return { outcome: 'blocked', reason: 'invalid_candidate', evidence: [] };
  }

  const best = ranked[0];

  if (best === undefined) {
    return { outcome: 'blocked', reason: 'no_candidates', evidence: [] };
  }

  if (best.score < resolved.thresholdAccept) {
    return { outcome: 'blocked', reason: 'below_threshold', evidence: ranked };
  }

  const runnerUp = ranked[1];
  const margin = best.score - (runnerUp?.score ?? 0);

  if (margin < resolved.minMargin) {
    return {
      outcome: 'blocked',
      reason: 'insufficient_margin',
      evidence: ranked,
    };
  }

  return {
    outcome: 'accepted',
    sopId: best.sopId,
    score: best.score,
    evidence: ranked,
  };
}
