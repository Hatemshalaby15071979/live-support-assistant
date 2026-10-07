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
 * Build a case-insensitive alternation for literal words, without the `i` flag.
 *
 * The `i` flag cannot be used on rules whose meaning depends on capitalisation.
 * `i` applies to the whole pattern, so it turns `[A-Z]` into "any letter" — and
 * for the contact rule the entire point is that the name parts are capitalised.
 * With `i` set, `from working with`, `from the Bourne` and `from colleagues made`
 * all matched as people's names, and every document in CPython's FAQ was
 * quarantined by it: a 100% rate that read like a privacy emergency and was a
 * regex defect.
 *
 * The unit tests did not catch it because they only ever fed the rule text where
 * a name really was present. Real documents found it in one run.
 */
function caseInsensitiveLiterals(words) {
  return words
    .map((word) =>
      [...word]
        .map((character) => (/[a-z]/i.test(character) ? `[${character.toLowerCase()}${character.toUpperCase()}]` : character))
        .join(''),
    )
    .join('|');
}

/**
 * Street-type words, in every language the corpus carries.
 *
 * The first version of this rule was English-only, and the planted-PII recall
 * test measured what that cost: Spanish postal addresses scored 60%, and the
 * same rule change lifted the whole gate's non-English recall from 29-43% to
 * parity with English. A gate that only recognises `Street` is blind to a corpus
 * that is 147 of 345 documents in Spanish, Portuguese and French.
 */
const STREET_TYPES = [
  // English
  'Street', 'St', 'Road', 'Rd', 'Avenue', 'Ave', 'Lane', 'Ln', 'Drive', 'Dr',
  'Boulevard', 'Blvd', 'Court', 'Ct', 'Way', 'Place', 'Pl', 'Terrace', 'Close',
  'Crescent', 'Grove', 'Gardens', 'Square',
  // Spanish
  'Calle', 'Avenida', 'Paseo', 'Plaza', 'Camino', 'Ronda', 'Travesía',
  // Portuguese
  'Rua', 'Travessa', 'Alameda', 'Estrada', 'Largo',
  // French
  'Rue', 'Chemin', 'Impasse', 'Allée', 'Boulevard', 'Avenue', 'Place', 'Quai',
];

const STREET_TYPE_ALTERNATION = STREET_TYPES.join('|');

/**
 * Words that announce a phone number, in the four corpus languages.
 *
 * Used by the national-phone rule: a grouped number with no cue is far more
 * often a memory size, a port or a version than a number anyone rings. A cue
 * within 40 characters before the candidate is what separates
 * "our billing line is 555.987.6543" from "requests: 2000 4096".
 */
const PHONE_CUES = [
  // English
  'call', 'ring', 'dial', 'phone', 'telephone', 'tel', 'hotline', 'helpline',
  'line', 'number', 'contact us', 'reach us', 'speak to',
  // Spanish
  'llama', 'llamar', 'llame', 'teléfono', 'telefono', 'marcar', 'marca',
  // Portuguese
  'ligue', 'ligar', 'telefone', 'chamar',
  // French
  'appel', 'appelez', 'appeler', 'téléphone', 'telephone', 'composez', 'numéro',
];

/**
 * Local parts that are machine or role addresses, not people.
 *
 * `git@github.com` is an SSH remote, `noreply@` is a header instruction, and
 * neither can reach a person. They appear throughout technical documentation,
 * where treating them as personal data quarantines the document for being
 * correct.
 *
 * Deliberately narrow. Role addresses like `security@` are *not* here: a role
 * mailbox can still reach a person, and this module does not get to decide that
 * a published security contact is not personal data.
 */
const MACHINE_LOCAL_PARTS = new Set([
  'git', 'svn', 'hg', 'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'bounce', 'bounces',
]);

/**
 * Organisational role mailboxes — a **closed, named list**.
 *
 * Under prereg `g12`, approved 2026-10-07. These are published so that anyone
 * can write to the organisation; they are not a person's mailbox. Under GDPR a
 * role address does not identify a natural person, which is the test this gate
 * applies.
 *
 * **Closed in both directions.** A local part is excluded because it is on this
 * list. No prefix rule, suffix rule or "looks generic" heuristic may extend it,
 * and an exact match is required — so `jane.smith@`, `j.smith@`, `janesmith@`,
 * `jane_smith@` and `jsmith@` are all still findings. That is the condition the
 * change was approved on, and `verify-corpus-gates.mjs` tests it directly,
 * including `jane.support@` — a person whose surname is a role word — which
 * proves the match is on the whole local part rather than a substring.
 *
 * Kept separate from `MACHINE_LOCAL_PARTS` because the reasons differ: a machine
 * address cannot receive mail, a role address cannot identify a person.
 */
const ROLE_LOCAL_PARTS = new Set([
  'copyright', 'privacy', 'dpo', 'gdpr', 'data-protection', 'abuse', 'security',
  'security-response', 'legal', 'legal-support', 'compliance', 'support', 'press',
  'media', 'sales', 'billing', 'accounts', 'events', 'info', 'hello', 'contact',
  'admin', 'webmaster', 'postmaster', 'jobs', 'careers', 'trust-and-safety',
]);

/**
 * Words that are never a surname in a contact line.
 *
 * The name rules match two capitalised words after a trigger, and the real
 * corpus showed what that costs on legal and policy text: `contact GitHub
 * Support`, `Contact Us`, `Contact Information`, `signed by GitHub's Chief` and
 * `MR This` all read as people's names. GitHub's site-policy tree is 34.9%
 * quarantined almost entirely by this one class.
 *
 * A stop-list is a heuristic and it is not complete. It is here because the
 * alternative — matching any two capitalised words — is a rule that fires on
 * ordinary English, and a gate that quarantines a third of a legitimate corpus
 * is a gate that gets switched off.
 */
const NON_NAME_TOKENS = new Set([
  // support-desk vocabulary
  'support', 'staff', 'help', 'desk', 'service', 'services', 'sales', 'department',
  'office', 'center', 'centre', 'team', 'information', 'contact', 'us', 'requests',
  'request', 'notice', 'policy', 'policies', 'terms', 'agreement', 'plan', 'plans',
  // organisation suffixes
  'inc', 'ltd', 'llc', 'corp', 'corporation', 'company', 'foundation', 'project',
  'group', 'github', 'microsoft', 'google',
  // product and legal vocabulary
  'api', 'sdk', 'cli', 'cloud', 'enterprise', 'business', 'free', 'pro', 'privacy',
  'security', 'legal', 'billing', 'accounts', 'events', 'press', 'media', 'authority',
  // function words that are never a surname
  'this', 'that', 'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'by', 'with',
]);

/**
 * Whether a matched string ends in something that reads as a person's name.
 *
 * Applies to the honorific and labelled-contact rules. The last two tokens are
 * the candidate pair; the trigger is discarded.
 *
 * Rejects a pair when either token is a known non-name word, and when either is
 * fully uppercase — `AUTHORITY TO` is a contract heading, and an all-caps pair
 * is a heading far more often than it is two people.
 *
 * @param {string} value
 */
function endsInPersonName(value) {
  const tokens = value
    .split(/[\s:,]+/)
    .map((token) => token.replace(/'s$/, '').replace(/[^\p{L}'-]/gu, ''))
    .filter((token) => token !== '');

  const pair = tokens.slice(-2);
  if (pair.length < 2) return false;

  for (const token of pair) {
    if (NON_NAME_TOKENS.has(token.toLowerCase())) return false;
    if (token.length > 1 && token === token.toUpperCase() && /^[A-Z]+$/.test(token)) return false;
  }

  return true;
}

/**
 * Whether a candidate is a date rather than a phone number.
 *
 * `(2018-04-03` was quarantining two GitHub documents: the parenthesised form
 * bypasses the separator rule, and a date has plenty of digits. An ISO-shaped
 * date is never a phone number.
 *
 * @param {string} value
 */
function looksLikeDate(value) {
  return /\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(value);
}

/**
 * Words that precede a number in technical prose without labelling it.
 *
 * **This list is the inversion.** Under prereg `g13`, the account-identifier
 * rule matches *any* label-like token followed by a long identifier and rejects
 * against this closed list — rather than matching a known label and missing
 * every word nobody listed. Three held-out sets showed the enumerated approach
 * cannot reach 95% on unseen vocabulary: `protocolo`, `Acct.`, `Réf.`,
 * `póliza`, `matrícula`, `dossier`, `contrat` were all invisible because nobody
 * had written them down.
 *
 * The list is closed. A word not on it is treated as a label, which is the
 * conservative default for a privacy gate: a false positive costs one quarantined
 * document, a false negative costs a customer identifier in a customer-facing
 * corpus.
 */
const NON_LABEL_WORDS = new Set([
  // document structure
  'chapter', 'section', 'part', 'page', 'line', 'figure', 'table', 'example', 'step', 'steps',
  'appendix', 'note', 'item', 'entry', 'row', 'column', 'list', 'index', 'paragraph',
  // versioning and source control
  'version', 'release', 'build', 'revision', 'rev', 'commit', 'sha', 'tag', 'branch', 'patch',
  // quantities and units
  'port', 'size', 'limit', 'count', 'total', 'timeout', 'interval', 'bytes', 'byte', 'memory',
  'cpu', 'replicas', 'nodes', 'milliseconds', 'millisecond', 'seconds', 'second', 'minutes',
  'minute', 'hours', 'hour', 'days', 'day', 'year', 'month', 'weeks', 'week', 'percent',
  'min', 'max', 'default', 'minimum', 'maximum', 'average', 'mean', 'median', 'sum', 'rate',
  // approximators and connectives
  'above', 'below', 'since', 'after', 'before', 'about', 'around', 'roughly', 'approximately',
  'at', 'least', 'most', 'more', 'less', 'than', 'over', 'under', 'up', 'to', 'only', 'first',
  'second', 'third', 'next', 'last', 'each', 'every', 'some', 'any', 'all', 'both', 'other',
  'another', 'such', 'same', 'new', 'old', 'current', 'previous', 'following', 'given', 'shown',
  'listed', 'using', 'use', 'uses', 'with', 'without', 'from', 'into', 'onto', 'and', 'or',
  // articles and prepositions, in the four corpus languages
  'the', 'a', 'an', 'of', 'for', 'in', 'on', 'by', 'as', 'is', 'are', 'was', 'were',
  'de', 'da', 'do', 'del', 'dos', 'das', 'le', 'la', 'les', 'un', 'une', 'des', 'du',
  'el', 'los', 'las', 'una', 'unos', 'il', 'lo', 'der', 'die', 'das', 'een', 'het', 'van',
  // network and protocol vocabulary
  'http', 'https', 'tcp', 'udp', 'ip', 'dns', 'url', 'uri', 'epoch', 'unix', 'utc',
  'gmt', 'iso', 'ascii', 'utf',
  // Romance-language function words and common verbs. Without these, French,
  // Spanish and Portuguese prose passes the "is this a label" test on words like
  // `moins` and `faut` — "il faut au moins de 10000 objets" was accepted as an
  // account identifier.
  'au', 'aux', 'moins', 'plus', 'environ', 'vers', 'selon', 'sous', 'sur', 'dans',
  'par', 'pour', 'avec', 'sans', 'faut', 'falloir', 'peut', 'doit', 'etre', 'être',
  'avoir', 'faire', 'est', 'sont', 'sera', 'seront', 'etait', 'était', 'etait',
  'menos', 'mas', 'cerca', 'sobre', 'entre', 'hasta', 'desde', 'para', 'por', 'con',
  'sin', 'hay', 'tem', 'há', 'sao', 'são', 'estao', 'estão', 'ate', 'até', 'mais',
  // "value" and its cognates — the word that produced "la valeur\n 31568 est trop
  // grande" as an account identifier.
  'value', 'values', 'valeur', 'valeurs', 'valor', 'valores', 'valore', 'wert',
]);

/** @param {string} value */
function isNonLabelWord(value) {
  return NON_LABEL_WORDS.has(value.toLowerCase());
}

/**
 * IBAN check digits, ISO 13616 — the mod-97 test.
 *
 * Structure-driven rather than label-driven, per prereg `g13`: an IBAN is
 * identifiable by its own shape and check digits, so it does not need the
 * document to say "IBAN" first.
 *
 * @param {string} value
 */
function isValidIban(value) {
  const compact = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;

  // Move the first four characters to the end, map letters to numbers, mod 97.
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));

  let remainder = 0;
  for (const character of expanded) {
    remainder = (remainder * 10 + Number(character)) % 97;
  }
  return remainder === 1;
}

/** BIC / SWIFT: four letters, two letters, two alphanumerics, optional branch. */
function isValidBic(value) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(value.replace(/\s/g, '').toUpperCase());
}

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
    name: 'email-obfuscated',
    // Addresses written to defeat scrapers. The held-out set found this: a
    // documentation corpus writes `jane [dot] smith [at] acme [dot] com` in the
    // same paragraph as the real address, and a rule that only knows `@` misses
    // it entirely.
    pattern: /[\p{L}\p{N}._%+-]+\s*\[(?:at|dot)\]\s*[\p{L}\p{N}._%+-]+(?:\s*\[(?:at|dot)\]\s*[\p{L}\p{N}._%+-]+)+/giu,
  },
  {
    name: 'national-id',
    // Government identity numbers. The held-out set scored this at 20% because
    // there was no rule at all — only the US SSN shape was covered, inside a rule
    // named for it. A Spanish DNI, a Brazilian CPF and a French NIR are all
    // personal data of the most consequential kind.
    pattern: new RegExp(
      [
        // Spanish DNI: eight digits and a check letter.
        '\\b\\d{8}[A-HJ-NP-TV-Z]\\b',
        // Spanish NIF for a legal entity.
        '\\b[ABCDEFGHJKLMNPQRSUVW]\\d{7}[0-9A-J]\\b',
        // Brazilian CPF, punctuated.
        '\\b\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\b',
        // French NIR: 13 digits, usually spaced, sex digit first.
        '\\b[12]\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{3}\\s?\\d{3}\\s?\\d{2}\\b',
        // Label-driven forms. A German Steuer-ID and a Polish PESEL have no
        // shape distinctive enough to match blind without firing on every
        // eleven-digit number in a technical corpus, so they are matched where
        // the document names them — which is how they appear.
        `\\b(?:${caseInsensitiveLiterals(['Steuer-ID', 'SteuerID', 'PESEL', 'codice fiscale', 'NIE', 'NIF', 'DNI'])})\\s*[:#-]?\\s*\\d[\\d\\s-]{7,}\\b`,
      ].join('|'),
      // No `i` flag: it would make `[A-HJ-NP-TV-Z]` match lowercase letters and
      // turn the DNI branch loose on ordinary words. Labels carry their own case
      // alternation instead.
      'gu',
    ),
  },
  {
    name: 'bank-identifier',
    // IBAN is shape-driven and self-validating: ISO 13616 defines its length and
    // its mod-97 check digits, so it needs no label and cannot be confused with
    // an ordinary token.
    //
    // **BIC deliberately stays label-driven, and that is a deviation from the
    // prereg worth stating.** A BIC carries no check digit, and its shape — four
    // letters, two letters, two alphanumerics — is exactly the shape of any
    // eight-letter uppercase word. `EXTERNAL` validates as a BIC. A shape-only
    // BIC rule would fire on every acronym in a technical corpus, which is a
    // precision collapse, not a detection gain.
    pattern: new RegExp(
      [
        '\\b[A-Z]{2}\\d{2}(?:\\s?[A-Z0-9]{1,4}){3,9}\\b',
        '\\b\\d{2}-\\d{2}-\\d{2}\\b',
        '\\b\\d{5}\\s\\d{5}\\s\\d{11}\\s\\d{2}\\b',
        `\\b(?:${caseInsensitiveLiterals(['BIC', 'SWIFT'])})\\s*[:#-]?\\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b`,
      ].join('|'),
      'gu',
    ),
    validate: (value) => {
      const compact = value.replace(/\s/g, '');
      // The IBAN branch is greedy enough to swallow uppercase prose; the mod-97
      // test is what makes it a check rather than a guess.
      if (/^[A-Z]{2}\d{2}/.test(compact)) return isValidIban(value);
      return true;
    },
  },
  {
    name: 'phone-international',
    pattern: /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\p{Zs}.-]?\d{2,4}(?:[\s.-]?\d{2,4})?/gu,
  },
  {
    name: 'phone-national',
    // Grouped digits with separators, validated rather than trusted.
    //
    // The first version hardcoded the North-American 3-3-4 shape, which scored
    // 60% on the planted set: `912 345 678` (Spanish) and `01 45 67 89 01`
    // (French) are ordinary national numbers and neither matched. Widening it to
    // "any grouped digits" then wrecked precision on technical documents, where
    // `2000 4096`, `1000 2000` and `10.102.30` are memory sizes, CPU counts and
    // version strings.
    //
    // So the shape alone is not enough and a cue is not always needed either.
    // `validate` accepts a candidate when it is *intrinsically* phone-shaped —
    // a parenthesised area code, or the 3-3-4 grouping that only phone numbers
    // use — or when the prose around it says so. A bare `3-3-3` with spaces is
    // Spanish; the same with dots is a quantity.
    pattern: /\(?\b\d{2,4}\)?(?:[\s.-]\d{2,4}){1,5}\b/g,
    validate: (value, text, index) => {
      if (looksLikeDate(value)) return false;

      const digits = value.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) return false;
      if (/^0+$/.test(digits)) return false;

      // A parenthesised area code is unambiguous by shape.
      if (value.includes('(') || value.includes(')')) return true;

      // The 3-3-4 grouping is a phone number and almost nothing else.
      const groups = value.split(/[\s.-]/).filter((part) => part !== '');
      const separatorIsUniform = new Set(value.replace(/[^\s.-]/g, '')).size <= 1;
      if (separatorIsUniform && groups.length === 3 && groups[0].length === 3 && groups[1].length === 3 && groups[2].length === 4) {
        return true;
      }

      // French national numbers are five groups of two — `04 78 55 01 42`,
      // `01.45.67.89.01`. The shape is as distinctive as 3-3-4 and, like it,
      // needs no cue. The held-out set found this: the carrier was "Le bureau de
      // Lyon est joignable au 04 78 55 01 42", and `joignable` was not a cue.
      if (separatorIsUniform && groups.length === 5 && groups.every((group) => group.length === 2)) {
        return true;
      }

      // Otherwise the prose has to say so. A cue within 40 characters before the
      // candidate, which covers "Call +44 ...", "Llama al 912 ...", "our line is
      // 555 ...". Without this, every pair of numbers in a configuration example
      // is a phone number.
      const window = text.slice(Math.max(0, index - 40), index).toLowerCase();
      return PHONE_CUES.some((cue) => window.includes(cue));
    },
  },
  {
    name: 'account-identifier',
    // HYBRID, and the history matters. Three approaches have now been measured
    // on the real corpus:
    //
    //   1. Enumerated vocabulary (~30 nouns). Precision fine, recall 60% on
    //      unseen vocabulary — it misses every word nobody wrote down.
    //   2. Shape-first default: any label-like word + a long number. Recall up,
    //      **precision collapsed**: every source but one would drop, because in
    //      technical prose every noun before a number looks like a label
    //      (`requests: 2000 4096`, `limits are 1000 2000`). 28.6% on French.
    //   3. Shape-first restricted to a genuinely long identifier. Better, still
    //      four sources over the limit.
    //
    // So this rule keeps the **enumerated** vocabulary, where precision is
    // known, and `account-identifier-shape` below carries the shape-first case
    // at a length technical prose does not produce. The trade-off is real and is
    // reported rather than tuned away.
    pattern: new RegExp(
      `\\b(?:${caseInsensitiveLiterals([
        'account', 'customer', 'case', 'ticket', 'invoice', 'order', 'reference', 'policy',
        'claim', 'contract', 'membership', 'referencia', 'referência', 'référence', 'número',
        'numero', 'nº', 'n°', 'caso', 'pedido', 'factura', 'cliente', 'client', 'conta',
        'cuenta', 'socio', 'expediente', 'matrícula', 'dossier', 'contrat',
        'a/c', 'acct', 'réf', 'ref', 'póliza', 'poliza', 'protocolo', 'protocol',
      ])})[.]?` +
        `(?:\\s+(?:${caseInsensitiveLiterals(['de', 'da', 'do', 'del', 'id', 'no', 'number', 'num'])})[.]?)*` +
        `\\s*[:#-]?\\s*[A-Z]{0,4}[-_/]?\\d{4,}(?:[-_/]\\d{2,})?`,
      'gu',
    ),
  },
  {
    name: 'account-identifier-shape',
    // The shape-first case, at a length technical prose does not produce.
    //
    // A technical corpus is full of `<noun>: <small number>` — timeouts, ports,
    // replica counts, memory sizes. What it does **not** contain is a long
    // identifier with a separator structure, which is what a real account or
    // reference number looks like. Requiring eight or more digits, or a
    // separator-joined pair, separates the two without needing to enumerate the
    // nouns, which is what the previous three attempts got wrong.
    pattern: /\b[\p{L}][\p{L}'/.\-°º]{1,19}[.]?(?:\s+[\p{L}][\p{L}'/.\-°º]{0,19}[.]?){0,2}\s*[:#-]?\s*[A-Z]{0,4}[-_/]?(?:\d{8,}|\d{4,}[-_/]\d{3,})\b/gu,
    validate: (value) => {
      const words = value.match(/[\p{L}][\p{L}'/.\-]*/gu) ?? [];
      if (words.length === 0) return false;

      // A hyphen-joined name with no whitespace before the digits is a resource
      // identifier, not an account number: `nginx-deployment-1370807587` is a
      // Kubernetes pod, and it was quarantining three Spanish and Portuguese
      // documents. A short prefix like `AC-` or `PL-` is still accepted, because
      // that is what a real reference looks like.
      const beforeDigits = value.replace(/\d[\d\-_/]*$/, '');
      if (/\S/.test(beforeDigits) && beforeDigits.includes('-') && !/[\s:]/.test(beforeDigits)) {
        const label = beforeDigits.replace(/-$/, '');
        if (label.length > 4) return false;
      }

      return words.some((word) => !isNonLabelWord(word.replace(/[.]$/, '')));
    },
  },
  {
    name: 'postal-address',
    // Three orderings, because languages disagree about where the number goes:
    //
    //   number then name then type   "221B Baker Street", "12 Elm Road"
    //   type then name then number   "Calle Mayor 45"
    //   number then type then name   "17 Rue de la Paix"
    //
    // The English-only first version matched only the first and scored 60%.
    pattern: new RegExp(
      [
        `\\b\\d{1,5}[A-Za-z]?\\s+[A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+)*\\s+(?:${STREET_TYPE_ALTERNATION})\\b\\.?`,
        `\\b(?:${STREET_TYPE_ALTERNATION})\\s+[A-Z\\p{L}][\\p{L}'-]*(?:\\s+[\\p{L}'-]+)*\\s+\\d{1,5}\\b`,
        `\\b\\d{1,5}\\s+(?:${STREET_TYPE_ALTERNATION})\\s+[\\p{L}][\\p{L}'-]*(?:\\s+[\\p{L}'-]+)*`,
        // English written name-first, type-second, number-last: `Elm Road 12`.
        // The held-out set found this, and none of the three orderings above
        // could see it — the type sits in the middle rather than at an end.
        `\\b[A-Z][\\p{L}'-]+\\s+(?:${STREET_TYPE_ALTERNATION})\\s+\\d{1,5}\\b`,
        // Post-office boxes carry no street type and no name, so none of the
        // orderings above can see one. `P.O. Box 4471` scored as nothing.
        `\\bP\\.?\\s?O\\.?\\s+Box\\s+\\d{1,6}\\b`,
      ].join('|'),
      'gu',
    ),
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
    // Honorifics in the four corpus languages. The English-only version scored
    // 50% on the planted set: `Sra Elena Vargas`, `Sr Rafael Menezes` and
    // `Mme Claire Dubois` are ordinary ways to name someone in a document, and
    // none of them matched.
    pattern: new RegExp(
      `\\b(?:${caseInsensitiveLiterals([
        'Mrs', 'Miss', 'Mr', 'Ms', 'Dr', 'Prof', 'Sir', 'Dame', 'Mx',
        'Srta', 'Sra', 'Sr', 'Dra', 'Dña', 'Doña', 'Don', 'Mme', 'Mlle', 'Rev', 'Fr', 'Ilma', 'Ilmo',
      ])})[.]?\\s+[A-Z](?:[.]\\s*)?[\\p{L}'-]*(?:\\s+[A-Z][\\p{L}'-]+)?`,
      'gu',
    ),
    validate: (value) => endsInPersonName(value),
  },
  {
    name: 'labelled-contact-name',
    // No `i` flag, deliberately: the trigger words carry their own case
    // alternation so the name parts stay strictly capitalised. Longer
    // alternatives are listed first so `contacto` is tried before `contact`.
    //
    // Bare `from`, `signed`, `firmado` and `assinado` were removed after the
    // real corpus showed what they cost: "from Docker Compose" and "Signed CA
    // Certificate" are two capitalised words after a common verb, and both were
    // quarantining whole Kubernetes documents. The two-word forms are the ones
    // that actually announce a name.
    pattern: new RegExp(
      `\\b(?:${caseInsensitiveLiterals([
        'contacto', 'contato', 'contact', 'escalation owner', 'responsable', 'responsável',
        'data controller', 'encarregado', 'delegado de protección',
        'written by', 'escrito por', 'posted by', 'publicado por', 'signed by', 'firmado por',
        'assinado por', 'rédigé par', 'cordialement', 'author', 'autor', 'regards', 'saludos',
        'thanks', 'gracias', 'obrigado',
      ])})\\s*[:,]?\\s*[A-Z][\\p{L}'-]+[,\\s]+[A-Z][\\p{L}'-]+\\b`,
      'gu',
    ),
    validate: (value) => endsInPersonName(value),
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
 * Domains that cannot identify anyone, by definition.
 *
 * RFC 2606 and RFC 6761 reserve these for documentation and testing, precisely so
 * that examples never point at a real mailbox. An address at `example.com` is not
 * personal data — it is the internet's agreed way of writing an address that is
 * not one — and treating it as a finding quarantines documentation for the sin of
 * using a correct example.
 *
 * This is a correctness rule, not a relaxation: it removes matches that were
 * never personal data, and it does not touch any address that could reach a
 * person.
 */
const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.edu',
  'localhost',
  'localhost.localdomain',
  'invalid',
  'test',
  // Documentation placeholders, in the same category as RFC 2606: a domain that
  // exists only so an example has somewhere to point. `domain.com` and
  // `nowhere.com` are the two GitHub Docs uses, and `users.noreply.github.com`
  // is GitHub's own template domain — `USERNAME@users.noreply.github.com` is a
  // reference-table entry, not a mailbox.
  'domain.com',
  'nowhere.com',
  'yourdomain.com',
  'mydomain.com',
  'somedomain.com',
  'users.noreply.github.com',
]);

const RESERVED_SUFFIXES = ['.example', '.invalid', '.test', '.localhost', '.local'];

/** @param {string} address */
function isReservedAddress(address) {
  const at = address.lastIndexOf('@');
  if (at === -1) return false;

  const domain = address.slice(at + 1).toLowerCase();

  if (RESERVED_DOMAINS.has(domain)) return true;

  return RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/** A machine or role mailbox cannot reach a person. */
function isMachineAddress(address) {
  const at = address.lastIndexOf('@');
  if (at === -1) return false;

  const local = address.slice(0, at).toLowerCase();
  if (MACHINE_LOCAL_PARTS.has(local)) return true;

  // Exact match only, and the whole local part — `jane.support` is a person.
  return ROLE_LOCAL_PARTS.has(local);
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

      // A reserved example domain is not a personal identifier. Dropped here
      // rather than in the pattern, so the reasoning is visible and the email
      // rule keeps matching everything it should.
      if (rule.name === 'email' && (isReservedAddress(value) || isMachineAddress(value))) continue;

      // A rule may carry a validator for conditions a regex cannot express —
      // "the same separator throughout", "at least seven digits", "a cue word
      // nearby". A candidate the validator rejects is not a finding and is not a
      // miss; it is a candidate that was never one.
      if (typeof rule.validate === 'function' && !rule.validate(value, text, match.index)) continue;

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
 * The share of items in a source that carry a **high-severity** finding.
 *
 * This is the source-drop rate. It counts high-severity findings only, under the
 * prereg at `docs/prereg/g10-quarantine-rate-severity.md` — approved by the owner
 * on 2026-10-07 after a planted-PII recall test measured detection at 100%
 * across 44 strings, 8 categories and 4 languages.
 *
 * **The item rule is not changed by this.** An item carrying a finding of *any*
 * severity is still quarantined and still stays out of the corpus;
 * `quarantined` below is that count and it is the one the corpus is built from.
 * The only question this rate answers is whether the whole source is discarded.
 *
 * The reason it changed: the rate was designed for a corpus where 5% is a
 * signal, and `django-faq-en` has 8 documents, so a single deliberately
 * published security contact address was 12.5% and dropped the source. A
 * `review`-severity finding still removes its document — it stops taking eleven
 * others with it.
 *
 * @param {readonly {text: string}[]} items
 * @returns {{
 *   rate: number,            // high-severity share; the drop rule uses this
 *   rateAny: number,         // any-finding share; what the rule used to use
 *   quarantined: number,     // items excluded from the corpus, by ANY finding
 *   quarantinedHigh: number,
 *   total: number,
 *   dropped: boolean,
 * }}
 */
export function quarantineRate(items) {
  const total = items.length;
  let quarantined = 0;
  let quarantinedHigh = 0;

  for (const item of items) {
    const scan = scanForPii(item.text);
    if (!scan.clean) quarantined += 1;
    if (scan.findings.some((finding) => finding.severity === 'high')) quarantinedHigh += 1;
  }

  const rate = total === 0 ? 0 : quarantinedHigh / total;
  const rateAny = total === 0 ? 0 : quarantined / total;

  return {
    rate,
    rateAny,
    quarantined,
    quarantinedHigh,
    total,
    dropped: rate > SOURCE_QUARANTINE_LIMIT,
  };
}
