/**
 * Which gate patterns count as a catch, per planted category.
 *
 * Shared by both recall harnesses so the two cannot drift. They did drift once:
 * the regression harness still mapped `email` to `['email']` alone, so the
 * obfuscated-address string scored as a miss even though `email-obfuscated`
 * caught it, and an SSN scored as a miss while the SSN-shaped rule caught it.
 * Two harnesses scoring the same gate differently is worse than one harness.
 *
 * The rule is strict where the gate claims a category — a postal address
 * reported as an account identifier is a miss for the address rule, and counting
 * it would hide a broken rule behind a working one — and permissive where it
 * does not, because a reader who sees `CPF 123.456.789-00` flagged as a national
 * id would call that found.
 */

/** @type {Readonly<Record<string, readonly string[]>>} */
export const ACCEPTED_PATTERNS = Object.freeze({
  email: ['email', 'email-obfuscated'],
  'phone-international': ['phone-international'],
  'phone-national': ['phone-national'],
  'postal-address': ['postal-address'],
  'account-identifier': ['account-identifier', 'account-identifier-shape'],
  'honorific-name': ['honorific-name'],
  'labelled-contact-name': ['labelled-contact-name'],
  'national-id': ['national-id', 'national-insurance-or-ssn-shaped'],
  'bank-identifier': ['bank-identifier'],
});

/**
 * @param {string} category
 * @returns {readonly string[]}
 */
export function acceptedPatternsFor(category) {
  return ACCEPTED_PATTERNS[category] ?? [category];
}
