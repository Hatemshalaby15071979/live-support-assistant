# A0 pinned input SHA-256 record

**Recorded before A0.3.** Date: 2026-10-11. Branch: `prog/xss-real-client`.
Base commit: `2b05106c64e9173e81213771ddb4e1c9aa6039ae`.
Worktree was already dirty at session start; these are hashes of the current pinned inputs.

Command:

```sh
sha256sum tooling/eval/simulated-tenant/chaos-500.json tooling/eval/simulated-tenant/corpus.json tooling/corpus/spotcheck-batch-1.json tooling/corpus/manifest.json tooling/corpus/snapshots/*.json tooling/market/smoke-golden-digest.json
```

| Pinned input | SHA-256 |
|---|---|
| `tooling/eval/simulated-tenant/chaos-500.json` | `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96` |
| `tooling/eval/simulated-tenant/corpus.json` | `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe` |
| `tooling/corpus/spotcheck-batch-1.json` | `0d2a8b0f4f3f3887eacb12082425b00412a402c69079a3294c96ef2f0fc61629` |
| `tooling/corpus/manifest.json` | `ab6923382b4b2ff8832519b774edce534106a8eb4bf016933b7732b84833da40` |
| `tooling/corpus/snapshots/0a28888d198b76713fa7be2b8271f097d4abb858b09d80b5cd2f22105dc2196e.json` | `0a28888d198b76713fa7be2b8271f097d4abb858b09d80b5cd2f22105dc2196e` |
| `tooling/corpus/snapshots/1f590ab46c2568630e97a77ba558b199f3010ff022e97c263cce2cec47091271.json` | `1f590ab46c2568630e97a77ba558b199f3010ff022e97c263cce2cec47091271` |
| `tooling/corpus/snapshots/362b751cb0af73a28707b995416270d69815f22c6c86cb97805615b4534733d3.json` | `362b751cb0af73a28707b995416270d69815f22c6c86cb97805615b4534733d3` |
| `tooling/corpus/snapshots/617c93c050d9ce68fcd440147cb66724b5de80119aecff0a0ed0478baee8ff9b.json` | `617c93c050d9ce68fcd440147cb66724b5de80119aecff0a0ed0478baee8ff9b` |
| `tooling/corpus/snapshots/a141f5723771b0f845df5f9632126c53f0d03466dddeefce51fc9b4b0a861ec4.json` | `a141f5723771b0f845df5f9632126c53f0d03466dddeefce51fc9b4b0a861ec4` |
| `tooling/corpus/snapshots/b6d1f4ab07f4014a39f24616651db17576ff96c83c6b1047e59ffe2984d38c05.json` | `b6d1f4ab07f4014a39f24616651db17576ff96c83c6b1047e59ffe2984d38c05` |
| `tooling/corpus/snapshots/dfdc29da33d670f0acce2bc495b1b7eed882a459c0690196c6cfbc77512512f3.json` | `dfdc29da33d670f0acce2bc495b1b7eed882a459c0690196c6cfbc77512512f3` |
| `tooling/market/smoke-golden-digest.json` | `aa20306b68d8baf9acd98366920bd5226816556adeb16312ad3b47006ae480cd` |

The seven snapshot digests match their content-addressed filenames. No pinned input was modified by A0.3. This complete baseline includes the evaluation batch and corpus, owner spot-check batch, manifest and its snapshots, and Market Twin golden digest.

## Post-renormalization verification

The isolated normalization commit is `d1d6052497524e66d25b2b11fb0c167fa0855a28`, parent `2b05106c64e9173e81213771ddb4e1c9aa6039ae`. `git add --renormalize .` ran in a detached temporary worktree; the index diff contained only `.gitattributes` because the committed text files were already LF. Dirty pinned inputs copied from the main worktree were excluded from the commit. All 12 pinned inputs were re-hashed after renormalization and every value matched the baseline table above; no pinned digest changed.
