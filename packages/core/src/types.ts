/**
 * Domain types for the Explainable SOP Escalation & Audit Engine.
 *
 * These types are the shared contract between the three platform shells (web,
 * desktop, mobile) and the enterprise command centre. They carry no runtime
 * dependency and no behaviour.
 */

/**
 * A standard operating procedure as delivered inside a policy bundle.
 *
 * Every field here is deterministic content: it is either shown verbatim to the
 * frontline agent or written to the audit trail. Nothing in this type is
 * generated at query time.
 */
export interface SopDocument {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly summary: string;
  readonly suggestedReply: string;
  readonly escalationRequired: boolean;
  readonly escalationReason: string;
  /**
   * Transitional field, retained only so the Phase 0 build reproduces the
   * prototype's keyword behaviour exactly. Phase 1 replaces keyword matching
   * with the on-device embedding scorer and this field is removed with it.
   */
  readonly triggerKeywords: readonly string[];
}

/**
 * A scored retrieval candidate.
 *
 * `evidence` is the explainability payload: the terms or tokens that produced
 * the score, retained so an auditor can reconstruct why the system answered or
 * refused to answer.
 */
export interface MatchCandidate {
  readonly sopId: string;
  /**
   * Normalised score. The value is meaningful only against the
   * `thresholdAccept` of the configuration it was evaluated with; a score at or
   * above that threshold is an acceptance.
   */
  readonly score: number;
  readonly evidence: readonly string[];
}

/**
 * Confidence Gate configuration, owned per tenant and change-logged.
 *
 * Two signals, both required. `thresholdAccept` is an absolute floor on the
 * winning score; `minMargin` is the gap the winner must hold over the runner-up.
 *
 * The margin requirement is not decoration. Measured on the Phase 1 golden set,
 * an absolute cosine threshold could not separate answerable from unanswerable
 * queries at all — the best absolute threshold reaching 0.95 precision answered
 * 1 of 50 in-scope queries — because MiniLM's absolute similarity scale is
 * compressed and corpus-dependent. The top-1 minus top-2 margin separated the
 * same queries cleanly. Both signals are therefore part of the gate.
 *
 * `topK` bounds the evidence returned with every decision, accepted or blocked.
 *
 * Calibrated per-tenant values live in `GATE_CONFIGS`; this interface is the
 * shape of one tenant's entry.
 */
export interface ConfidenceGateConfig {
  readonly thresholdAccept: number;
  readonly minMargin: number;
  readonly topK: number;
}

/**
 * Per-tenant gate configuration: tenant id → that tenant's
 * {@link ConfidenceGateConfig}.
 *
 * This is the single source of truth for calibrated thresholds (V2 P3). The gate
 * resolves a tenant's config from this map; a tenant absent here fails closed
 * rather than borrowing another tenant's threshold, so a calibrated value can
 * never be silently overridden by a fallback.
 */
export type PerTenantGateConfig = Readonly<Record<string, ConfidenceGateConfig>>;

/**
 * Prototype starting configuration, measured on the current five-procedure corpus
 * (50 in-scope and 15 out-of-scope queries). At 0.18 the gate auto-answers 8/50
 * with no measured wrong procedure or out-of-scope acceptance. The former 0.15
 * value now produces one false accept and 0.909 precision, so it is not safe as a
 * default. This is not a tenant-calibrated constant; onboarding must replace it
 * from representative labelled traffic before go-live.
 */
export const DEFAULT_GATE_CONFIG: ConfidenceGateConfig = {
  thresholdAccept: 0,
  minMargin: 0.18,
  topK: 5,
};

/**
 * Calibrated per-tenant gate thresholds (V2 P3).
 *
 * T01 0.68, T04 0.53, T05 0.61 were chosen on the 500-rung calibration split to
 * reach zero unsafe answers; `minMargin` and `topK` are held at the shipped
 * default because calibration addressed `thresholdAccept` only.
 *
 * There is deliberately no global entry other than `simulated`: a tenant absent
 * from this map fails closed in `evaluateGate` rather than borrowing another
 * tenant's threshold. Calibrated values therefore cannot be overridden by a
 * fallback.
 */
export const GATE_CONFIGS: PerTenantGateConfig = {
  simulated: DEFAULT_GATE_CONFIG,
  'T01-platform-operations-style': { thresholdAccept: 0.68, minMargin: 0.18, topK: 5 },
  'T04-customer-support-style': { thresholdAccept: 0.53, minMargin: 0.18, topK: 5 },
  'T05-policy-style': { thresholdAccept: 0.61, minMargin: 0.18, topK: 5 },
};

/**
 * Number of keyword hits the original prototype required before it would
 * surface a procedure.
 */
export const LEGACY_REQUIRED_MATCHES = 2;

/**
 * Phase 0 transitional configuration.
 *
 * The transitional keyword scorer reports score in units of required matches,
 * so `1.0` is exactly the legacy bar of two hits, and `minMargin` is disabled.
 * This reproduces the prototype's behaviour while routing every decision through
 * the real gate. Deleted in Phase 4 when the keyword scorer goes.
 */
export const LEGACY_GATE_CONFIG: ConfidenceGateConfig = {
  thresholdAccept: 1,
  minMargin: 0,
  topK: 5,
};

/** The tenant's gate parameters, as they stood when a query ran. */
export interface GateParameters {
  readonly thresholdAccept: number;
  readonly minMargin: number;
}

/** Why the gate refused to answer. */
export type GateBlockReason =
  | 'no_candidates'
  | 'below_threshold'
  | 'insufficient_margin'
  | 'invalid_candidate'
  | 'unknown_tenant';

/** The gate matched a procedure above the acceptance bar. */
export interface GateAccepted {
  readonly outcome: 'accepted';
  readonly sopId: string;
  readonly score: number;
  readonly evidence: readonly MatchCandidate[];
}

/**
 * The gate refused to answer. No procedure content is returned; the caller is
 * expected to open a structured human escalation carrying `evidence`.
 */
export interface GateBlocked {
  readonly outcome: 'blocked';
  readonly reason: GateBlockReason;
  readonly evidence: readonly MatchCandidate[];
}

export type GateDecision = GateAccepted | GateBlocked;
