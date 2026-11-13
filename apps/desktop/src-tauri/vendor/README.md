# Vendored crates

`schemars-0.8.22/` is the crates.io `schemars` 0.8.22 source, patched locally
via `[patch.crates-io]` in `../Cargo.toml` to fix the `preserve_order` alias
for `indexmap` 1.9.x (tauri-apps/tauri#14928). A path patch carries no registry
checksum, so `schemars-0.8.22.sha256` records SHA-256 for every file in the
crate and `tooling/security/verify-vendored-schemars.mjs` recomputes it in the
verification gate (ME-13). Any edit, addition, or deletion fails the gate.

Regenerate the manifest only after an intentional, reviewed change:

```
(cd apps/desktop/src-tauri/vendor && find schemars-0.8.22 -type f | sort | xargs sha256sum) \
  > apps/desktop/src-tauri/vendor/schemars-0.8.22.sha256
```
