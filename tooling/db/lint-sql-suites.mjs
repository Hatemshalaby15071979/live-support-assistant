#!/usr/bin/env node
//
// Offline lint for the SQL test suites. Runs before any database is touched, so a
// malformed suite fails in milliseconds instead of after a container boot.
//
// Two failure classes are checked, both of which have already shipped a red run:
//
//   1. A psql variable in its single-quoted form (`:'name'`) inside a dollar-quoted
//      body. psql does not interpolate there, so the body reaches the server with a
//      literal `:` and dies with `syntax error at or near ":"`.
//      The double-quoted form (`:"name"`) is deliberately NOT checked: it is
//      indistinguishable from a JSON literal such as `'{"outcome":"answered"}'`,
//      and flagging those is a false positive on files that are perfectly valid.
//
//   2. A broken dollar-quoted block. Counting delimiters is not enough on its own —
//      a truncated block pasted on top of a complete one can leave an even number of
//      `$tag$` tokens. So the check does two things: it pairs delimiters in order and
//      requires matching tags, and for every region opened by `do $tag$` it requires
//      the body to end with `end`. A `do` block that ends in the middle of a clause is
//      a truncated paste. That is exactly what shipped in phase8_retention.sql, and it
//      silently skipped the test-harness revoke, leaving harness functions callable.
//
// Usage:
//   node tooling/db/lint-sql-suites.mjs            # every supabase/tests/*.sql
//   node tooling/db/lint-sql-suites.mjs <file>...  # just the named files

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "supabase/tests";
const TAG_RE = () => /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;

function suiteFiles(argv) {
  if (argv.length > 0) return argv;
  return readdirSync(TEST_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(TEST_DIR, name));
}

// The last meaningful token of `text`: trailing whitespace, semicolons and `--` line
// comments are not part of it.
function tailWord(text) {
  let s = text;
  for (;;) {
    const next = s.replace(/[\s;]+$/, "").replace(/--[^\n]*$/, "");
    if (next === s) return s;
    s = next;
  }
}

function lint(file) {
  const raw = readFileSync(file, "utf8");
  const problems = [];

  // psql does not treat a delimiter inside a `--` comment as a delimiter, so blank the
  // full-line comments before scanning. Replacing each comment with spaces of the same
  // length keeps every offset identical to the original file, so messages still point at
  // the right place. (Block comments are not handled; these suites do not use them.)
  const src = raw.replace(/^[ \t]*--[^\n]*$/gm, (line) => " ".repeat(line.length));

  const tokens = [...src.matchAll(TAG_RE())].map((m) => ({
    tag: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));

  // Pair delimiters with a stack. A token whose tag differs from the currently open
  // region is raw text inside that region (for example `as $$ select 1 $$` sitting
  // inside a `$q$` probe string), not a nested block — dollar-quoting does not nest.
  const pairs = [];
  const stack = [];
  for (const token of tokens) {
    if (stack.length === 0) {
      stack.push(token);
      continue;
    }
    const open = stack[stack.length - 1];
    if (token.tag === open.tag) {
      stack.pop();
      pairs.push({ tag: open.tag, start: open.start, bodyStart: open.end, bodyEnd: token.start });
    }
  }
  for (const open of stack) {
    problems.push(`unclosed ${open.tag} opened at offset ${open.start} — psql will not find a matching close`);
  }

  for (const pair of pairs) {
    const body = src.slice(pair.bodyStart, pair.bodyEnd);

    // Test the text BEFORE the opening delimiter — slicing to `bodyStart` would still
    // include the delimiter itself, so the tail would read `do $hyg$` and never match.
    if (/\bdo$/i.test(tailWord(src.slice(0, pair.start)))) {
      const tail = tailWord(body);
      if (!/\bend\s*;?$/i.test(tail)) {
        problems.push(
          `do ${pair.tag} block at offset ${pair.start} does not end with \`end\` (ends with \`${tail.slice(-24)}\`) — the body looks truncated`,
        );
      }
    }

    for (const m of body.matchAll(/:'[A-Za-z_][A-Za-z0-9_]*'/g)) {
      problems.push(`psql variable ${m[0]} inside a ${pair.tag} body — psql will not interpolate it`);
    }
  }

  return problems;
}

const files = suiteFiles(process.argv.slice(2));
let failed = 0;

for (const file of files) {
  let problems;
  try {
    problems = lint(file);
  } catch (err) {
    console.error(`    FAIL  ${file}: ${err.message}`);
    failed += 1;
    continue;
  }
  if (problems.length === 0) {
    console.log(`    pass  ${file}`);
    continue;
  }
  failed += 1;
  console.error(`    FAIL  ${file}`);
  for (const problem of problems.slice(0, 10)) console.error(`            ${problem}`);
  if (problems.length > 10) console.error(`            ... ${problems.length - 10} more`);
}

if (failed > 0) {
  console.error(`\nOffline SQL lint FAILED: ${failed} of ${files.length} file(s).`);
  process.exit(1);
}
console.log(`\nOffline SQL lint OK: ${files.length} file(s).`);
