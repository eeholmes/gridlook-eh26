# Handoff — 2026-11-25

Orientation for the next session. Open threads are a record, not a task list.

## State

- **Live:** <https://eeholmes.github.io/gridlook-eh26/>. Pages deploys from
  GitHub Actions on every push to `main`. The last deploy (PR #2) succeeded.
- **gridlook pinned at** `a2f6ed5` (`eeholmes/gridlook` `main`, 2026-11-25).
- **Catalog:** 76 stores from the 17 Zarr datasets on the hackathon summary
  page. It opens on the OceanSODA-ETHZ v2 fgco2 pyramid with Eli's chosen view.
  How the URLs were found, what the probe showed, and why the catalog is built
  this way are in [`docs/design/catalog.md`](../docs/design/catalog.md).
- Only `main` exists; PR branches were deleted after merge.

## Shipped

- PR #1: catalog, deploy workflow, default-dataset script, README with gridlook
  credit and citation.
- PR #2: default view moved to OceanSODA v2 fgco2.
- This PR: agent docs and `scripts/probe-catalog.test.ts`.

## Open threads

- **Browser check.** Only the default OceanSODA view is known to have been
  looked at in a browser (Eli took its camera settings from it). Rendering of
  everything else is unverified; the suspects are listed in the README's
  "Known problems".
- **MITHO** needs a data-side fix (bare `NaN` in `zarr.json`). Nobody has told
  the providers.
- **WAPOSAL** may be more clutter than use; Eli has not decided whether to keep
  all 31, one, or none.
- **Actions on Node 20.** The deploy log warns that `checkout@v4`,
  `setup-node@v4`, `upload-pages-artifact@v3` and `deploy-pages@v4` target Node
  20, which GitHub is retiring. Harmless for now.
- **gridlook-side ideas noticed here** (belong in `eeholmes/gridlook`, not this
  repo): taking the default dataset from the first catalog entry would retire
  `set_default_dataset.py`; the Icechunk fallback hides the real error for
  invalid-JSON stores like MITHO.

## Working notes

- Node 24 on this hub: `~/.local/opt/node-v24.20.0-linux-x64/bin`. The probe and
  build run from a worktree of `~/gridlook` with its `node_modules` symlinked
  in.
- `gh` here always gets `--repo eeholmes/gridlook-eh26`.
