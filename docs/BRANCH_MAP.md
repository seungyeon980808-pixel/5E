# Branch and release map

Observed public state on 2026-09-26. Recheck moving refs before any public operation.

| Role | Ref/source | Exact observed commit | State |
|---|---|---|---|
| Default source | `main` | `d8d75df3a9db3c1bd662867df80a82dbe3bde5fc` | Public remote observation |
| Pages source | `codex/preview-1.6.0:/` | `09f94d830a7cec15632aa5286f6cffbe58e5f39f` | Serves stable and preview entries |
| Latest desktop release | tag `v1.5.8` | `0684bcf70b01959423b12556a077c3077b04afc7` | Published 2026-08-13 |
| 1.6 remediation | `codex/release-160-remediation` | resolved at release build | Candidate `HOLD` |

The 1.6 implementation baseline reviewed for this documentation was `8d98bab0f5c9f762a6d8ed6ca8c50e4e369d4013`. It is not the final release SHA. Documentation, dependency, and native-validation work may add commits. The build records the final full SHA in the external artifact manifest.

## Worktree rules

- One task branch per worktree; inspect `git status` before editing.
- Never use a remembered worktree count or branch list as release evidence. Capture `git worktree list --porcelain` and remote refs at the decision time.
- A merged or reachable branch is not deletion approval. Keep release worktrees while retention is `PENDING_OWNER_APPROVAL`.
- Do not switch a shared worktree to another branch or remove unfamiliar work.
- Ports and temporary profiles belong to the task that started them and must be included in its cleanup receipt.

## Refresh commands

```bash
git worktree list --porcelain
git ls-remote --heads origin
git ls-remote --tags origin
git status --short
```

These commands are observations. They do not authorize merge, deletion, deployment, tag creation, or release publication.
