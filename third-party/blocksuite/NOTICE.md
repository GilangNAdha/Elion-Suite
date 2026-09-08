# BlockSuite source and licence notice

Elion uses the actual, published BlockSuite standalone editor packages, pinned to **0.19.5**. These packages are covered by **Mozilla Public License 2.0**; see `MPL-2.0.txt`. The Elion application licence does not replace the covered dependencies' licences.

Copyright and original notices remain in the upstream sources. Contributors include TOEVERYTHING PTE. LTD. and BlockSuite contributors.

## Corresponding source

The source (`src/`) is included in the published packages obtainable with `npm install` / `npm ci`, and in their npm tarballs. Exact dependencies and integrity hashes are in Elion's `package-lock.json`.

- https://www.npmjs.com/package/@blocksuite/presets/v/0.19.5
- https://www.npmjs.com/package/@blocksuite/blocks/v/0.19.5
- https://www.npmjs.com/package/@blocksuite/store/v/0.19.5
- https://www.npmjs.com/package/@blocksuite/block-std/v/0.19.5
- Upstream repository: https://github.com/toeverything/blocksuite
- Published `gitHead`: `df177511c94f1df7f63a06ed1d855a4185a34597`

The standalone packages are used instead of importing AFFiNE's application/backend services or test-only workspace helpers. Elion's own adapter handles its existing records, snapshots and blob storage.

Compatibility pins:

- `@blocksuite/icons` 2.1.75 retains the symbol names expected by this standalone editor release. Its package has an older Node engine-range declaration; the published browser code has been built and tested here with Node 22.22.3.
- `file-type` is overridden to 21.3.2 to include both malformed-ASF and ZIP decompression-limit fixes rather than retaining the older transitive parser.

No BlockSuite dependency source is patched in `node_modules`. Custom Elion blocks and theme adapters are separate application files. Other dependency licences continue to apply as declared in their distributions.
