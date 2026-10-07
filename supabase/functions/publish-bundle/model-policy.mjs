/**
 * Which model a published bundle may name.
 *
 * This exists because the publisher used to accept one from the request:
 *
 *     const model = { ...hardcoded, ...(body.model ?? {}) };
 *
 * so any authenticated publisher could sign a bundle whose manifest named a model
 * the tenant's devices do not have. The client had no check either, so the bundle
 * installed and every passage was scored against the wrong embedding space — no
 * error, a plausible answer, a wrong one. The client now refuses a mismatch
 * (`installBundle` takes a required `expectedModel`); this is the server half, and
 * it is the half that stops the bad bundle existing at all.
 *
 * The file it lives in already argues the principle for the corpus: *the corpus is
 * read from the database, not from the request*, because "a caller-supplied corpus
 * is the last thing that should be authoritative". The model is the same kind of
 * fact. It is deployment configuration — it says which model this deployment's
 * clients load — and a request body is not where deployment configuration comes
 * from.
 *
 * Two behaviours are possible and they are not equivalent:
 *
 *   - **Ignore.** Silently drop `body.model`. Simple, but a caller who believes
 *     they published model X receives a bundle for model Y and is never told.
 *     Silent divergence is the failure mode this whole change exists to remove.
 *   - **Reject on disagreement.** Accept a request that restates the server's
 *     model, refuse one that contradicts it, naming the field.
 *
 * This module rejects. It is the owner's "ignore or allowlist" with the silent
 * branch replaced by a loud one: an equal claim is ignored, a conflicting claim
 * fails with HTTP 400. No caller in this repository sends `model` at all
 * (`tooling/transport/probe-publish.mjs` sends `{ sops }`), so nothing breaks.
 *
 * Deliberately dependency-free and side-effect-free, so the Node harness
 * (`tooling/verify-publish-model-policy.mjs`) can import it directly and the Deno
 * edge function can import it without a bundler.
 */

/**
 * The model this deployment publishes.
 *
 * Every field is load-bearing and each one changes every vector the Confidence
 * Gate compares against a threshold:
 *
 *   - `id` and `revision` name the artifact. The revision is a commit sha, not a
 *     branch — a branch would silently re-pin the corpus.
 *   - `quantization` changes the weights, so it changes the scores.
 *   - `dimensions` changes the vector width, so a mismatch invalidates every
 *     stored vector.
 */
export const PUBLISHED_MODEL = Object.freeze({
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  quantization: 'q8',
  dimensions: 384,
});

/** The fields a caller may restate. Anything else in the body is ignored. */
const COMPARED_FIELDS = Object.freeze(['id', 'revision', 'quantization', 'dimensions']);

/**
 * Decide the model for a publish request.
 *
 * @param {unknown} requested The `model` field of the request body, if any.
 * @returns {{ok: true, model: typeof PUBLISHED_MODEL}
 *          | {ok: false, status: number, error: string}}
 */
export function resolvePublishModel(requested) {
  // Absent is the normal case and means "publish what this deployment serves".
  if (requested === undefined || requested === null) {
    return { ok: true, model: PUBLISHED_MODEL };
  }

  if (typeof requested !== 'object' || Array.isArray(requested)) {
    return {
      ok: false,
      status: 400,
      error: 'model must be an object naming the model this bundle is for, or omitted',
    };
  }

  const disagreements = [];

  for (const field of COMPARED_FIELDS) {
    const claimed = requested[field];

    // A field the caller did not mention is not a claim. Comparing an absent
    // value against the server's would reject `{ id }` alone, which is a request
    // that agrees with the server about the only thing it mentions.
    if (claimed === undefined || claimed === null) continue;

    if (claimed !== PUBLISHED_MODEL[field]) {
      disagreements.push(`${field}: requested ${JSON.stringify(claimed)}, this deployment publishes ${JSON.stringify(PUBLISHED_MODEL[field])}`);
    }
  }

  if (disagreements.length > 0) {
    return {
      ok: false,
      status: 400,
      error:
        'this deployment publishes one model and a bundle may not name another, ' +
        `because a client that loaded a different one would score every passage ` +
        `against the wrong vectors. ${disagreements.join('; ')}`,
    };
  }

  // The caller restated the server's model, or stated nothing that contradicts
  // it. The server's value is used either way; a caller never supplies it.
  return { ok: true, model: PUBLISHED_MODEL };
}
