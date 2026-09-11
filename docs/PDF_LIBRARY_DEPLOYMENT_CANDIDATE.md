# PDF library deployment candidate

The web app and the recent-three PDF pack are separate deployment units. Build both into a persistent directory outside the repository so generated evidence and `.omo` paths cannot enter the candidate:

```sh
node tools/pdf-library/build-pack.mjs \
  --spec .omo/evidence/pdf-library/T5/recent-three-pack-spec.json \
  --output /absolute/external/path/recent-three-pack-source

npm run candidate:build -- \
  --output /absolute/external/path/web-candidate \
  --pack /absolute/external/path/recent-three-pack-source \
  --pdf-pack-base-url ../pack/recent-three/

npm run candidate:verify -- /absolute/external/path/web-candidate
npm run candidate:serve -- --candidate /absolute/external/path/web-candidate --port 24871
```

Open `http://127.0.0.1:24871/app/index.html`. The relative pack URL resolves to `/pack/recent-three/` on the same candidate host. A deployed absolute URL must use HTTPS; loopback HTTP remains available for local verification.

`candidate.json` records the app version and stage-manifest digest plus the pack ID, version, document/page/file counts, exact logical byte size, and SHA-256 digests of `pack.json` and `checksums.json`. The verifier recomputes those values, validates the full pack through the same install boundary as the app, and rejects unsafe paths or any `.omo` path.

Pack replacement validates all incoming metadata, JSON, PDF headers, byte limits, and hashes before the persistence adapter's atomic commit. A corrupt, interrupted, same-version checksum-changing, oversized, path-traversing, or older update leaves the active version readable. Removing a pack deletes only its installed records and bytes; user source folders and project-embedded images are outside the pack store.

The candidate is for local evaluation. It is not a public upload and makes no claim that the included third-party source PDFs may be redistributed. A signedness-free x64 portable application ZIP may be built with `npx electron-builder --win zip --x64`; call it a portable ZIP, not an installer. The manual workflow in `.github/workflows/windows-candidate.yml` is the reproducible x64 NSIS path when macOS cannot run its cached `makensis`; it verifies the PE signature, minimum size, and SHA-256 before retaining a private Actions artifact.
