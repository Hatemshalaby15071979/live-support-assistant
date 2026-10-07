/**
 * g15 scope/refusal layer — refusal-only (prereg `docs/prereg/g15-p4-scope-refusal-layer.md`, A4).
 *
 * Operates on retrieval-candidate signals BEFORE the gate. It emits decisions only — never
 * procedure text. `applyScopeLayer` takes numeric signals and a config and returns
 * `{ escalate, serve }`; there is no code path here that can emit content. The harness
 * (`run-g15.mjs`) asserts this property on every result object.
 *
 * Signals:
 *   top1   — cosine of the question to its best candidate procedure
 *   margin — top1 minus the best cosine among candidates from a DIFFERENT document
 *            (gold labels are document-level, so separation between documents is the
 *            scope signal the prereg names: "top-1/runner-up separation").
 *
 * Config (all values come from the preregistered sweeps — nothing invented here):
 *   thresholdAccept — the tenant's shipped gate threshold (never changed by this layer)
 *   layerTop1       — the layer's own refusal threshold, swept over a band around the
 *                     gate decision boundary (thresholdAccept ± {0.00, 0.02, 0.04})
 *   marginFloor     — the layer's margin floor, the preregistered minMargin sweep
 *                     {0.10, 0.18, 0.25, 0.35}
 */
export function applyScopeLayer({ top1, margin }, { thresholdAccept, layerTop1, marginFloor }) {
  if (typeof top1 !== 'number' || typeof margin !== 'number') {
    return { escalate: true, serve: false, reason: 'missing_signals' };
  }
  const escalate = top1 < layerTop1 || margin < marginFloor;
  return { escalate, serve: !escalate && top1 >= thresholdAccept };
}
