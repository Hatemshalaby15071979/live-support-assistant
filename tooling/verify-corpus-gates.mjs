#!/usr/bin/env node
/**
 * Unit checks for the corpus gates.
 *
 * These two gates decide what enters every tenant corpus, so they are the last
 * place a "looks about right" should be accepted. Each is exercised on the shapes
 * it must catch and, just as importantly, on the shapes it must not — a gate that
 * quarantines everything and a gate that quarantines nothing both pass a naive
 * suite.
 *
 * The privacy cases include the counterexamples that make the module's stated
 * limit honest: a bare ten-digit run and a version number must NOT be read as a
 * phone number, because a gate that fires on those is a gate that gets turned
 * off.
 *
 * Run after `pnpm build` (it needs nothing else):
 *     node tooling/verify-corpus-gates.mjs
 */

import { checkLicence, loadAllowlist, redistributionPolicy } from './corpus/licence-gate.mjs';
import { SOURCE_QUARANTINE_LIMIT, quarantineRate, scanForPii } from './corpus/pii-gate.mjs';

const checks = [];

function record(name, expected, observed, ok) {
  checks.push({ name, expected: String(expected), observed: String(observed), ok });
}

function expect(name, expected, observed) {
  record(name, expected, observed, expected === observed);
}

function expectTrue(name, condition, detail = '') {
  record(name, 'true', condition ? 'true' : `false ${detail}`, condition === true);
}

// ===========================================================================
// Privacy gate
// ===========================================================================

const PII_CASES = [
  // Deliberately not example.com: a reserved domain is not a finding, so using
  // one here would test the exclusion rather than the rule.
  ['email in prose', 'Write to support@acme-helpdesk.co.uk for help.', 'email'],
  ['email with plus addressing', 'Reach jane.doe+support@example.co.uk today.', 'email'],
  ['international phone', 'Call +44 20 7946 0958 between 9 and 5.', 'phone-international'],
  ['national phone', 'Ring (555) 123-4567 to confirm.', 'phone-national'],
  ['dashed national phone', 'Our line is 555.123.4567.', 'phone-national'],
  ['account identifier', 'Your account id: AC-12345678 was suspended.', 'account-identifier'],
  ['case reference', 'See case #99887766 for the history.', 'account-identifier'],
  ['postal address', 'Send it to 221B Baker Street, London.', 'postal-address'],
  ['honorific name', 'Reviewed by Dr Amina Farouk on Tuesday.', 'honorific-name'],
  ['labelled contact name', 'Contact: Jane Smith for escalation.', 'labelled-contact-name'],
  ['ssn shaped', 'Reference 123-45-6789 on the form.', 'national-insurance-or-ssn-shaped'],
];

for (const [label, text, expectedPattern] of PII_CASES) {
  const result = scanForPii(text);
  expectTrue(
    `${label} is caught`,
    result.findings.some((finding) => finding.pattern === expectedPattern),
    `patterns: ${result.findings.map((finding) => finding.pattern).join(', ') || 'none'}`,
  );
}

// The counterexamples. A gate that fires on these would quarantine most of any
// real corpus, and a gate that quarantines everything gets switched off.
const CLEAN_CASES = [
  ['a version number is not an address', 'Upgrade to version 1.2.3 for the fix.'],
  ['ordinary prose', 'Coins are used to send Gifts and cannot be transferred between accounts.'],
  ['a time range', 'Available between 09:00 and 17:00, Monday to Friday.'],
  ['a price', 'The fee is 12.99 for the first month.'],
  ['a percentage', 'Roughly 45% of requests escalate on the first pass.'],
  // These three are taken verbatim from CPython's FAQ, where the first real
  // harvest quarantined 100% of the source. The `i` flag on the contact rule had
  // turned `[A-Z]` into "any letter", so a common preposition followed by two
  // ordinary words read as a person's name.
  ['"from working with" is not a name', 'much of it from working with the community.'],
  ['"from the Bourne" is not a name', 'This is a phrase from the Bourne shell documentation.'],
  ['"from colleagues made" is not a name', 'Suggestions from colleagues made the design better.'],
  ['a capitalised trigger with lowercase words is not a name', 'Contact the support team for details.'],
  // RFC 2606 / 6761 reserved domains are not personal data. Without this,
  // documentation is quarantined for using a correct example address.
  ['a reserved example.com address is not personal data', 'Send mail to receiver@example.com and wait.'],
  ['a reserved .invalid domain is not personal data', 'Write to nobody@host.invalid for a bounce.'],
  ['a reserved .test domain is not personal data', 'Mail admin@mail.test in the fixture.'],
];

// ---------------------------------------------------------------------------
// Precision, on the strings the real corpus produced.
//
// Every case below was an actual quarantine on a real Kubernetes document. The
// recall fix that lifted non-English detection from 29-43% to 100% did so by
// widening three rules, and widening them quarantined six documents that were
// perfectly ordinary. These are those six, kept as counterexamples so the next
// widening has to get past them.
// ---------------------------------------------------------------------------

const CORPUS_PRECISION_CASES = [
  ['a memory quantity is not a phone number', 'requests: 2000 4096 for the container'],
  ['a CPU count is not a phone number', 'limits are 1000 2000 in this example'],
  ['a version fragment is not a phone number', 'the address 10.102.30 is internal'],
  ['a dotted quantity is not a phone number', 'the cache grows to 162.900.000 bytes'],
  ['a French preposition before a number is not an account id', "il faut au moins de 10000 objets"],
  ['a French preposition across a line break is not an account id', 'la valeur\n 31568 est trop grande'],
  ['a capitalised verb phrase is not a contact name', 'Signed CA Certificate must be present'],
  ['a product name after a preposition is not a contact name', 'migrating from Docker Compose is supported'],
  ['an SSH remote is not a personal address', 'clone it with git@github.com as the remote'],
  ['a no-reply address is not a personal address', 'mail goes out from noreply@acme-helpdesk.co.uk'],
  // From GitHub Docs, where this class quarantined 34.9% of the site-policy tree.
  ['"contact <org> support" is an instruction, not a name', 'Please contact GitHub Support for help with this.'],
  ['"Contact Us" is not a name', 'Contact Us if you have questions about the policy.'],
  ['"Contact Information" is a heading, not a name', 'Contact Information\nName and address of the controller.'],
  ['an all-caps heading is not a name', 'AUTHORITY TO BIND the company is required.'],
  ['"MR This" is not a name', 'MR This section describes the limits.'],
  ['a parenthesised date is not a phone number', 'see the entry (2018-04-03 for details'],
  // Documentation placeholders, from GitHub Docs. Same reasoning as RFC 2606:
  // a domain that exists only so an example has somewhere to point is not an
  // address anyone can receive mail at.
  ['a documented placeholder domain is not personal data', 'for example octocat@nowhere.com works fine'],
  ['a template domain is not personal data', 'the form ID+USERNAME@users.noreply.github.com is used'],
  ['a generic placeholder domain is not personal data', 'replace it with email+shortcode@domain.com'],
];

for (const [label, text] of CORPUS_PRECISION_CASES) {
  const result = scanForPii(text);
  expectTrue(label, result.clean === true, `matched: ${result.findings.map((finding) => finding.pattern).join(', ')}`);
}

// The cue rule must still catch a phone number the prose announces, or the
// precision fix would have traded a false positive for a false negative.
for (const [label, text] of [
  ['a cued national number is caught', 'Call 912 345 678 to reach the desk.'],
  ['a cued dotted number is caught', 'Our billing line is 555.987.6543.'],
  ['a cued French number is caught', 'Appelez le 01 45 67 89 01 pour toute question.'],
  ['a 3-3-4 grouping is caught without a cue', 'Report outages to 415-555-0199 at any hour.'],
]) {
  const result = scanForPii(text);
  expectTrue(
    label,
    result.findings.some((finding) => finding.pattern.startsWith('phone-')),
    result.findings.map((finding) => finding.pattern).join(', ') || 'none',
  );
}

// The reserved-domain rule must not swallow real addresses.
{
  const real = scanForPii('Contact security@djangoproject.com about it.');
  expectTrue(
    'a real domain is still caught',
    real.findings.some((finding) => finding.pattern === 'email'),
    real.findings.map((finding) => finding.pattern).join(', ') || 'none',
  );

  const lookalike = scanForPii('Mail a@example.com.evil.test-host.io now.');
  expectTrue(
    'a lookalike of a reserved domain is still caught',
    lookalike.findings.some((finding) => finding.pattern === 'email'),
    lookalike.findings.map((finding) => finding.pattern).join(', ') || 'none',
  );
}

for (const [label, text] of CLEAN_CASES) {
  const result = scanForPii(text);
  expectTrue(label, result.clean === true, `matched: ${result.findings.map((finding) => finding.pattern).join(', ')}`);
}

// The contact rule must still fire on a genuine labelled name, or the fix would
// have traded a false positive for a false negative.
for (const [label, text] of [
  ['Contact: Jane Smith', 'Contact: Jane Smith for escalation.'],
  ['Written by Jane Smith', 'Written by Jane Smith and reviewed.'],
  ['Author: Jane Smith', 'Author: Jane Smith, 2026.'],
  ['a lowercase trigger still fires', 'contact: Jane Smith today.'],
]) {
  const result = scanForPii(text);
  expectTrue(
    `${label} is caught`,
    result.findings.some((finding) => finding.pattern === 'labelled-contact-name'),
    `patterns: ${result.findings.map((finding) => finding.pattern).join(', ') || 'none'}`,
  );
}

// A bare ten-digit run must not be read as a phone number. It is deliberately
// not asserted to be *clean*: `Order 1234567890` is an order identifier, and the
// account rule catching it is the gate working. The claim under test is narrower
// and is the one that matters — the phone rule requires separators.
{
  const result = scanForPii('Order 1234567890 shipped.');
  expectTrue(
    'a bare ten-digit run is not a phone number',
    !result.findings.some((finding) => finding.pattern.startsWith('phone-')),
    result.findings.map((finding) => finding.pattern).join(', ') || 'none',
  );
  expectTrue(
    'but it is read as an order identifier, which is correct',
    result.findings.some((finding) => finding.pattern === 'account-identifier'),
    result.findings.map((finding) => finding.pattern).join(', ') || 'none',
  );
}

// The gate must not mutate. A scrubber would pass every case above and silently
// leave the pattern it was not told about.
{
  const original = 'Contact support@example.com or call (555) 123-4567.';
  const before = String(original);
  scanForPii(original);
  expect('the gate does not modify its input', before, original);
}

// De-duplication: the same address twice is one finding, not two.
{
  const result = scanForPii('Mail a@b.com, and copy a@b.com on the reply.');
  expect('a repeated match is reported once', 1, result.findings.filter((f) => f.pattern === 'email').length);
}

// Findings are ordered by position, so a reader can follow the document.
{
  const result = scanForPii('First a@b.com then c@d.com.');
  const indexes = result.findings.filter((f) => f.pattern === 'email').map((f) => f.index);
  expectTrue('findings are in document order', indexes[0] < indexes[1], JSON.stringify(indexes));
}

// The quarantine threshold, including its boundary, and the severity split that
// the prereg `g10` introduced.
{
  const clean = Array.from({ length: 20 }, () => ({ text: 'ordinary policy text' }));
  const empty = quarantineRate(clean);
  expect('a clean source has rate 0', 0, empty.rate);
  expect('a clean source is not dropped', false, empty.dropped);

  const oneInTwenty = [...clean.slice(1), { text: 'mail a@b.com' }];
  const atLimit = quarantineRate(oneInTwenty);
  expect('exactly 5% is not dropped', false, atLimit.dropped);
  expect('the limit is 0.05', 0.05, SOURCE_QUARANTINE_LIMIT);

  const twoInTwenty = [...clean.slice(2), { text: 'mail a@b.com' }, { text: 'call (555) 123-4567' }];
  const overLimit = quarantineRate(twoInTwenty);
  expectTrue('10% is dropped', overLimit.dropped === true, JSON.stringify(overLimit));

  const zero = quarantineRate([]);
  expect('an empty source has rate 0', 0, zero.rate);
  expect('an empty source is not dropped', false, zero.dropped);
}

// The prereg's actual content: only high severity counts toward the DROP rate,
// and items carrying a review-severity finding stay quarantined all the same.
// These two assertions together are the change, and either one alone would pass
// on a gate that had quietly done something else.
{
  const base = Array.from({ length: 20 }, () => ({ text: 'ordinary policy text' }));
  // Two review-severity findings: 10% of the source, well over the 5% limit if
  // severity were ignored.
  const reviewOnly = [...base.slice(2), { text: 'Reviewed by Dr Amina Farouk today.' }, { text: 'Contact: Jane Smith for escalation.' }];

  const result = quarantineRate(reviewOnly);

  expect('review-severity findings do not count toward the drop rate', 0, result.rate);
  expect('the any-severity rate is reported alongside', 0.1, Number(result.rateAny.toFixed(2)));
  expectTrue('a source with only review findings is not dropped', result.dropped === false, JSON.stringify(result));
  expectTrue('but its items are still quarantined', result.quarantined === 2, JSON.stringify(result));
  expectTrue('and none of them is high severity', result.quarantinedHigh === 0, JSON.stringify(result));
}

// A high-severity rate above the limit still drops the source. The relaxation
// must not have disarmed the rule it relaxed.
{
  const base = Array.from({ length: 20 }, () => ({ text: 'ordinary policy text' }));
  const high = [...base.slice(3), { text: 'mail a@b.com' }, { text: 'call (555) 123-4567' }, { text: 'write to c@d.org' }];
  const result = quarantineRate(high);

  expect('three high-severity items in twenty is 15%', 0.15, Number(result.rate.toFixed(2)));
  expectTrue('and the source is dropped', result.dropped === true, JSON.stringify(result));
}

// ===========================================================================
// Licence gate
// ===========================================================================

const allowlist = loadAllowlist();

const ALLOWED = ['CC0-1.0', 'public-domain', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'MIT', 'Apache-2.0', 'BSD-3-Clause', 'PSF-2.0', 'OGL-3.0'];
for (const id of ALLOWED) {
  const result = checkLicence(id, allowlist);
  expectTrue(`${id} is allowed`, result.allowed === true, JSON.stringify(result));
}

const REFUSED = [
  ['CC-BY-NC-4.0', 'a short-form NonCommercial id'],
  ['CC-BY-NC-SA-4.0', 'a NonCommercial ShareAlike id'],
  ['CC-BY-ND-4.0', 'a NoDerivatives id'],
  ['CC-BY-NC-ND-4.0', 'a NonCommercial NoDerivatives id'],
  ['CC-BY-NC-3.0', 'an older NonCommercial id'],
  ['proprietary', 'an explicit proprietary marker'],
  ['all-rights-reserved', 'the default copyright position stated explicitly'],
  ['some-licence-nobody-has-heard-of', 'an unknown id'],
];

for (const [id, label] of REFUSED) {
  const result = checkLicence(id, allowlist);
  expectTrue(`${label} is refused`, result.allowed === false, JSON.stringify(result));
}

// An unstated licence is a refusal, not a pending item.
for (const [value, label] of [
  [undefined, 'undefined'],
  [null, 'null'],
  ['', 'an empty string'],
  ['   ', 'whitespace only'],
  [42, 'a number'],
]) {
  const result = checkLicence(value, allowlist);
  expectTrue(`${label} as a licence is refused`, result.allowed === false, JSON.stringify(result));
}

// The refusals must say why. A gate whose log reads "refused" teaches nothing.
{
  const nc = checkLicence('CC-BY-NC-4.0', allowlist);
  expectTrue('a NonCommercial refusal names NonCommercial', nc.reason.toLowerCase().includes('noncommercial'), nc.reason);

  const nd = checkLicence('CC-BY-ND-4.0', allowlist);
  expectTrue('a NoDerivatives refusal names NoDerivatives', nd.reason.toLowerCase().includes('noderivatives'), nd.reason);

  const missing = checkLicence(undefined, allowlist);
  expectTrue('an unstated licence explains the default', missing.reason.includes('all rights reserved'), missing.reason);
}

// Redistribution policy, which is what decides whether snapshot text is committed.
{
  const shareAlike = redistributionPolicy(allowlist.allowed['CC-BY-SA-4.0']);
  expect('ShareAlike permits committing the text', true, shareAlike.commitText);
  expectTrue('ShareAlike says the corpus inherits the licence', shareAlike.reason.includes('ShareAlike'), shareAlike.reason);

  const cc0 = redistributionPolicy(allowlist.allowed['CC0-1.0']);
  expect('CC0 permits committing the text', true, cc0.commitText);

  const ogl = redistributionPolicy(allowlist.allowed['OGL-3.0']);
  expectTrue('OGL requires an attribution file', ogl.reason.includes('attribution'), ogl.reason);

  const blocked = redistributionPolicy({ name: 'example', redistribute: false, attribution_required: false });
  expect('a non-redistributable licence withholds the text', false, blocked.commitText);
}

// The allowlist itself must be well formed, since every refusal depends on it.
{
  let shaped = true;
  try {
    loadAllowlist();
  } catch {
    shaped = false;
  }
  expectTrue('the allowlist loads and shape-checks', shaped);

  expectTrue('every allowed entry declares redistribute', Object.values(allowlist.allowed).every((entry) => typeof entry.redistribute === 'boolean'));
  expectTrue('every allowed entry declares attribution_required', Object.values(allowlist.allowed).every((entry) => typeof entry.attribution_required === 'boolean'));
  expectTrue(
    'no allowed id carries an NC or ND marker',
    Object.keys(allowlist.allowed).every((id) => !/NC|ND/.test(id.replace(/^[A-Z-]+-/, ''))),
    Object.keys(allowlist.allowed).join(', '),
  );
}

// ===========================================================================
// Report
// ===========================================================================

const width = {
  name: Math.max(...checks.map((check) => check.name.length), 5),
  expected: Math.max(...checks.map((check) => check.expected.length), 8),
};

console.log('');
console.log(
  `${'CHECK'.padEnd(width.name)}  ${'EXPECTED'.padEnd(width.expected)}  ${'OBSERVED'.padEnd(width.expected)}  RESULT`,
);
console.log('-'.repeat(width.name + width.expected * 2 + 16));

for (const check of checks) {
  console.log(
    `${check.name.padEnd(width.name)}  ${check.expected.padEnd(width.expected)}  ${check.observed.padEnd(width.expected)}  ${check.ok ? 'PASS' : 'FAIL'}`,
  );
}

const failures = checks.filter((check) => !check.ok).length;

console.log('');
console.log(`checks: ${checks.length}  failures: ${failures}`);
console.log('');
console.log(failures === 0 ? 'CORPUS GATE VERIFICATION OK' : 'CORPUS GATE VERIFICATION FAILED');

process.exit(failures === 0 ? 0 : 1);
