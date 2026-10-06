# Advisory status of the baselined set

Baseline: `audit-baseline.json` -- 39 advisories.
Checked against the GitHub Advisory Database just now.

## Can be upgraded now (a fixed version exists)

| Severity | Advisory | Package summary | Vulnerable | First patched |
|---|---|---|---|---|
| critical | `GHSA-23hp-3jrh-7fpw` | node-tar: Decompression/parse DoS via unlimited input | `<= 7.5.18` | `7.5.19` |
| high | `GHSA-27p8-2357-5qqv` | xmldom: DocType `name` Injection Bypasses requireWellFormed | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| high | `GHSA-2v35-w6hq-6mfw` | xmldom: Uncontrolled recursion in XML serialization leads to DoS | `< 0.8.13` | `0.8.13` |
| high | `GHSA-34x7-hfp2-rc4v` | node-tar Vulnerable to Arbitrary File Creation/Overwrite via Hardlink Path Traversal | `< 7.5.7` | `7.5.7` |
| high | `GHSA-4w3w-2rp5-g8jm` | xmldom: Attribute name injection via setAttribute() bypasses requireWellFormed | `>= 0.9.0, <= 0.9.10` | `0.9.11` |
| high | `GHSA-5p2g-fcmc-qvqq` | image-size: JXL and HEIF parsers allow denial of service through infinite loops | `>= 1.2.0, <= 2.0.2` | `2.0.3` |
| high | `GHSA-6g55-p6wh-862q` | PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMapp | `<= 8.5.11` | `8.5.12` |
| high | `GHSA-8344-3jmq-59r6` | xmldom: Quadratic-time attribute deduplication | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| high | `GHSA-83g3-92jg-28cx` | Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain in node-tar Ext | `< 7.5.8` | `7.5.8` |
| high | `GHSA-8qq5-rm4j-mr97` | node-tar is Vulnerable to Arbitrary File Overwrite and Symlink Poisoning via Insufficient  | `<= 7.5.2` | `7.5.3` |
| high | `GHSA-8x88-c5mf-7j5w` | node-tar: Negative tar entry size causes infinite loop in archive replace | `<= 7.5.17` | `7.5.18` |
| high | `GHSA-93r5-fhx6-vmg9` | xmldom: Quadratic-time parsing via the malformed-input recovery path — `parseElementStartP | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| high | `GHSA-965w-775f-mr7g` | xmldom: Quadratic-memory consumption | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| high | `GHSA-9ppj-qmqm-q256` | node-tar Symlink Path Traversal via Drive-Relative Linkpath | `<= 7.5.10` | `7.5.11` |
| high | `GHSA-c7q8-3ch8-vqpv` | xmldom: Processing Instruction Target Injection Bypasses requireWellFormed | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| high | `GHSA-f6ww-3ggp-fr8h` | xmldom has XML injection through unvalidated DocumentType serialization | `< 0.8.13` | `0.8.13` |
| high | `GHSA-j759-j44w-7fr8` | xmldom has XML node injection through unvalidated comment serialization | `< 0.8.13` | `0.8.13` |
| high | `GHSA-qffp-2rhf-9h96` | tar has Hardlink Path Traversal via Drive-Relative Linkpath | `<= 7.5.9` | `7.5.10` |
| high | `GHSA-r28c-9q8g-f849` | PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Ar | `<= 8.5.17` | `8.5.18` |
| high | `GHSA-r292-9mhp-454m` | node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflow D | `<= 7.5.20` | `7.5.21` |
| high | `GHSA-r6q2-hw4h-h46w` | Race Condition in node-tar Path Reservations via Unicode Ligature Collisions on macOS APFS | `<= 7.5.3` | `7.5.4` |
| high | `GHSA-w2rr-34g9-rvrj` | xmldom: Element name injection via createElement() bypasses requireWellFormed | `>= 0.9.0, <= 0.9.10` | `0.9.11` |
| high | `GHSA-w3rx-r6r6-pgpr` | image-size: ICNS parser allows denial of service through an infinite loop | `>= 0.6.3, <= 2.0.2` | `2.0.3` |
| high | `GHSA-x4fp-j954-r2f4` | xmldom: End-tag Whitespace-Trim Regex ReDoS — quadratic backtracking in the 0.8.x end-tag  | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| high | `GHSA-x6wf-f3px-wcqx` | xmldom has XML node injection through unvalidated processing instruction serialization | `< 0.8.13` | `0.8.13` |
| low | `GHSA-m6fv-jmcg-4jfg` | send vulnerable to template injection that can lead to XSS | `< 0.19.0` | `0.19.0` |
| medium | `GHSA-6gmq-8vp8-gcm6` | xmldom: XML fragment injection via invalid EntityReference.nodeName during requireWellForm | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| medium | `GHSA-6h8r-xr42-gp59` | xmldom: Parser silently accepts a not-well-formed end tag whose name is followed by a line | `>= 0.7.0, <= 0.8.14` | `0.8.15` |
| medium | `GHSA-fxqj-rqcc-2cmp` | PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL read | `<= 8.5.22` | `8.5.23` |
| medium | `GHSA-gh4j-gqv2-49f6` | fast-xml-parser XMLBuilder: XML Comment and CDATA Injection via Unescaped Delimiters | `< 5.7.0` | `5.7.0` |
| medium | `GHSA-gvwx-54wh-qm9j` | node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records | `<= 7.5.16` | `7.5.17` |
| medium | `GHSA-qx2v-qp2m-jg93` | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output | `< 8.5.10` | `8.5.10` |
| medium | `GHSA-vmf3-w455-68vh` | node-tar applies PAX size override to intermediary GNU long-name/long-link headers, causin | `<= 7.5.15` | `7.5.16` |
| medium | `GHSA-w5hq-g745-h8pq` | uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided | `>= 12.0.0, < 12.0.1` | `12.0.1` |
| medium | `GHSA-w8wr-v893-vjvp` | node-tar: Process crash via PAX numeric path type confusion | `<= 7.5.17` | `7.5.18` |

## No patch exists -- these cannot be upgraded away

| Severity | Advisory | Summary | Vulnerable |
|---|---|---|---|
| high | `GHSA-86w9-cpqp-85rv` | node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm ele | `<= 1.4.0` |
| high | `GHSA-vfj7-8cjw-p6xm` | braces vulnerable to stack-exhaustion denial of service through deeply nested patterns | `<= 3.0.3` |
| high | `GHSA-wh4c-j3r5-mjhp` | xmldom: XML injection via unsafe CDATA serialization allows attacker-controlled markup ins | `<= 0.6.0` |
| medium | `GHSA-hp3w-g68c-fv3c` | sprintf-js vulnerable to denial of service through unbounded precision specifiers | `<= 1.1.3` |

## Summary

- fixable now: **35** of 39 (1 critical, 24 high, 1 low, 9 medium)
- no patch available: **4**

An advisory moving from the second list to the first is the
signal to act: upgrade it, then delete its baseline entry and
the note justifying it together. The gate treats the removal as a
resolution and holds the improvement without a code change.
