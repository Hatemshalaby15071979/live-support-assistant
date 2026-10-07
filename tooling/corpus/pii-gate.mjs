/**
 * The privacy gate.
 *
 * A harvested corpus is public text, and public text still carries personal
 * data: a forum post with a reply-to address, a support page with a named
 * engineer, a document with a case reference. The gate's job is to stop that
 * reaching a tenant corpus.
 *
 * Two rules shape the whole design:
 *
 *   **Quarantine, never scrub.** A scrubber produces text that looks clean and
 *   is not — it removes the pattern it was told about and silently leaves the
 *   one it was not, and the result reads as verified. This module never returns
 *   modified text. It returns findings, and the caller excludes the item. The
 *   cost is a lower yield; the benefit is that "clean" means "nothing matched",
 *   not "something was removed".
 *
 *   **A high quarantine rate means drop the source.** If more than 5% of a
 *   source's items carry personal data, the source is the problem, not the
 *   items. That threshold lives in `SOURCE_QUARANTINE_LIMIT` and is enforced by
 *   the harvester.
 *
 * What this does not do, stated plainly because the alternative is a false sense
 * of coverage: it does not detect a person's name in free prose. Name detection
 * is a statistical problem and a regex that claimed to solve it would produce
 * both misses and a flood of false positives on ordinary nouns. The patterns
 * below catch names only where the text itself labels them — an honorific, a
 * signature block, a "contact:" line. A name in mid-sentence passes. That is a
 * real limit and it is recorded in the provenance document rather than hidden
 * behind a green tick.
 */

/** Beyond this share of quarantined items, the source is dropped. */
export const SOURCE_QUARANTINE_LIMIT = 0.05;

/**
 * @typedef {object} Finding
 * @property {string} pattern The rule that matched.
 * @property {string} match The matched text, truncated — never the whole document.
 * @property {string} severity 'high' for direct identifiers, 'review' for shapes
 *   that need a human.
 */

/**
 * Direct identifiers. A match here is always high severity: these are things
 * that identify a person on their own.
 */
const HIGH_SEVERITY_RULES = [
  {
    name: 'email',
    // Deliberately permissive on the local part; the false-negative cost is a
    // personal address in a corpus, and the false-positive cost is one excluded
    // item.
    pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
  },
  {
    name: 'phone-international',
    pattern: /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?/g,
  },
  {
    name: 'phone-national',
    // Parenthesised area code, or a bare 3-3-4 / 4-3-3 group with separators.
    // Requires separators: a bare run of ten digits is more often an order
    // number or a timestamp than a phone number.
    pattern: /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
  },
  {
    name: 'account-identifier',
    pattern: /\b(?:account|customer|case|ticket|invoice|order|reference|ref)\s*(?:id|no\.?|number|#)?\s*[:#-]?\s*[A-Z]{0,4}[-_]?\d{5,}\b/gi,
  },
  {
    name: 'postal-address',
    // A house number followed by a street-type word. Catches "12 Elm Street"
    // and "221B Baker Rd"; misses an address written without a street type.
    pattern: /\b\d{1,5}[A-Za-z]?\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Close|Crescent|Grove|Gardens|Square)\b\.?/gu,
  },
];

/**
 * Shapes that need a human. These are the cases where the text itself marks a
 * name — an honorific, a signature, a contact line — which is the only name
 * detection this module claims.
 */
const REVIEW_SEVERITY_RULES = [
  {
    name: 'honorific-name',
    pattern: /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Sir|Dame|Mx)\.?\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?/gu,
  },
  {
    name: 'labelled-contact-name',
    // The `u` flag is load-bearing and was missing when this rule was first
    // written: without it `\p{L}` is not a property escape at all, the class
    // degrades to the literal characters `p { L }`, and the rule silently never
    // matches. It passed review because a rule that finds nothing looks exactly
    // like a rule with nothing to find.
    pattern: /\b(?:contact|author|written by|posted by|signed|regards|thanks|from)\s*[:,]?\s*[A-Z][\p{L}'-]+\s+[A-Z][\p{L}'-]+\b/giu,
  },
  {
    name: 'national-insurance-or-ssn-shaped',
    pattern: /\b(?:\d{3}-\d{2}-\d{4}|[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z])\b/g,
  },
];

const RULES = [
  ...HIGH_SEVERITY_RULES.map((rule) => ({ ...rule, severity: 'high' })),
  ...REVIEW_SEVERITY_RULES.map((rule) => ({ ...rule, severity: 'review' })),
];

/** Keep a finding readable and short; a finding is not a copy of the document. */
function excerpt(match) {
  return match.length <= 60 ? match : `${match.slice(0, 57)}...`;
}

/**
 * Scan text for personal-data shapes.
 *
 * Never modifies the input. Returns findings in document order, de-duplicated by
 * rule and match so one address repeated ten times is one finding, not ten.
 *
 * @param {string} text
 * @returns {{clean: boolean, findings: Finding[]}}
 */
export function scanForPii(text) {
  if (typeof text !== 'string') {
    throw new TypeError('scanForPii expects a string');
  }

  const seen = new Set();
  const findings = [];

  for (const rule of RULES) {
    // Each rule is global; `matchAll` needs the regex to carry /g, and cloning
    // per call keeps `lastIndex` from leaking between documents.
    const scanner = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of text.matchAll(scanner)) {
      const value = match[0];
      const key = `${rule.name}\u0000${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        pattern: rule.name,
        severity: rule.severity,
        match: excerpt(value),
        index: match.index,
      });
    }
  }

  findings.sort((left, right) => left.index - right.index);

  return { clean: findings.length === 0, findings };
}

/**
 * The share of items in a source that carry any finding.
 *
 * High-severity and review findings both count. Counting only high severity
 * would let a source with a 40% rate of honorific-named documents through on the
 * argument that none of them were confirmed, which is the wrong default for a
 * gate whose failure is a personal name in a customer-facing corpus.
 *
 * @param {readonly {text: string}[]} items
 * @returns {{rate: number, quarantined: number, total: number, dropped: boolean}}
 */
export function quarantineRate(items) {
  const total = items.length;
  let quarantined = 0;

  for (const item of items) {
    if (!scanForPii(item.text).clean) quarantined += 1;
  }

  const rate = total === 0 ? 0 : quarantined / total;

  return {
    rate,
    quarantined,
    total,
    dropped: rate > SOURCE_QUARANTINE_LIMIT,
  };
}
