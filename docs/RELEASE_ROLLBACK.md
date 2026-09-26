# Release rollback procedure

Rollback is a separately authorized public operation. This document does not authorize changes to Pages, tags, releases, branch rules, or assets.

## Receipt required before publication

- final candidate commit SHA and tag;
- Pages source branch, path, deployed SHA, stable URL, and preview URL;
- latest desktop tag, tag commit, release URL, asset names, sizes, and SHA-256 values;
- required checks and workflow-permission state from the policy owner;
- checksum verification against the exact uploaded filenames.

## Web rollback

1. Stop promotion and preserve the failure evidence.
2. Select the last known-good SHA from the recorded Pages receipt; do not infer it from a moving branch.
3. Use the separately approved deployment mechanism to restore that source or deploy a reviewed revert.
4. Verify `/` and `/preview/` by HTTP and browser, including visible versions and content hashes.
5. Update channel metadata to the observed public state in a follow-up commit.

## Desktop rollback

Do not silently replace installer or checksum assets in an existing release. If a new release is unsafe, an authorized operator must mark it clearly and stop directing users to it. Rebuild from a reviewed commit under a new patch version and run the complete release gates again. Preserve the withdrawn metadata and incident evidence.

## Policy rollback

`.github/repository-release-policy.json` remains declarative until an authorized operator applies it. Restore policy from the exact pre-apply API receipt; do not guess defaults or remove unrelated rules.
