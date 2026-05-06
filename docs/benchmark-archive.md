# Benchmark Archive

The complete local benchmark evidence archive from the laptop handoff is published as a GitHub Release:

https://github.com/matei-anghel/DystopiaBench/releases/tag/benchmark-archive-2026-05-06

The release is attached to commit `edd8d93556343830d01a99a58c9e4ae0c517e094` and preserves the local benchmark data available on 2026-05-06. The latest website run in the archive is `main-plus-mistral-medium-3-5-20260506` with 42 models, 22,680 prompts, 100% scorable rows, and no model/judge/skipped failures.

## Assets

- `dystopiabench-public-data-2026-05-06.tar.gz` contains `public/data`, including website-facing benchmark manifests, compressed prior reruns, eval cards, and `runs.json`.
- `dystopiabench-audit-artifacts-2026-05-06.tar.gz` contains `artifacts/private`, including run logs, checkpoints, checkpoint backups, and OpenRouter trace archives.
- `dystopiabench-archive-inventory-2026-05-06.tar.gz` contains file-level inventory metadata, source-file SHA-256 checksums, and benchmark field coverage summaries.
- `SHA256SUMS.txt` contains SHA-256 checksums for the uploaded release assets.

The archive intentionally excludes `.env.local`, API keys, `node_modules`, build caches, `.git/objects`, and the duplicate slim worktree. It does include raw benchmark prompts, model completions, judge votes/scores/reasoning, token usage, estimated costs, and captured reasoning traces where those fields exist locally.

## Download

```bash
gh release download benchmark-archive-2026-05-06 \
  --repo matei-anghel/DystopiaBench \
  --dir benchmark-archive-2026-05-06
```

## Verify

```bash
cd benchmark-archive-2026-05-06
shasum -a 256 -c SHA256SUMS.txt
```

To verify the source files after extraction:

```bash
tar -xzf dystopiabench-archive-inventory-2026-05-06.tar.gz
shasum -a 256 -c inventory/source-file-SHA256SUMS.txt
```

Run the source-file verification from the repository root after extracting `public/data` and `artifacts/private`.

## Extract

```bash
tar -xzf dystopiabench-public-data-2026-05-06.tar.gz
tar -xzf dystopiabench-audit-artifacts-2026-05-06.tar.gz
tar -xzf dystopiabench-archive-inventory-2026-05-06.tar.gz
```
