# Handoff — 2026-11-26

Orientation for the next session. Open threads are a record, not a task list.

## State

- **Live:** <https://eeholmes.github.io/gridlook-eh26/>. Pages deploys from
  GitHub Actions on every push to `main`. The last deploy (PR #2) succeeded.
- **gridlook pinned at** `a2f6ed5` (`eeholmes/gridlook` `main`, 2026-11-25).
- **Catalog:** 76 stores from the 17 Zarr datasets on the hackathon summary
  page. It opens on the OceanSODA-ETHZ v2 fgco2 pyramid with Eli's chosen view.
  How the URLs were found, what the probe showed, and why the catalog is built
  this way are in [`docs/design/catalog.md`](../docs/design/catalog.md).
- **Branches:** `feat/data-audit` (the audit, no PR yet) and
  `docs/handoff-audit-issue` (PR #5, a one-line handoff pointer to issue #4,
  superseded by this handoff).

## Shipped

- PR #1: catalog, deploy workflow, default-dataset script, README with gridlook
  credit and citation.
- PR #2: default view moved to OceanSODA v2 fgco2.
- PR #3: agent docs and `scripts/probe-catalog.test.ts`.

## In progress: data audit, issue #4 (branch `feat/data-audit`)

The plan, audience (EarthCODE publishers) and order are in the issue, agreed
with Eli on 2026-11-26.

- **Done:** steps 1–3 and 6. The probe now times opening and counts requests;
  `audit-values`, `audit-metadata` and `audit-stac` scripts are new. Raw output
  of the 2026-11-26 run is in `audit/2026-11/` (its README says which script
  made which file and the caveats).
- **Waiting on Eli:** step 4, her pass through
  [`docs/audit-2026-11-browser-checklist.md`](../docs/audit-2026-11-browser-checklist.md)
  (20 stores, each with the checks' prediction and a "Saw:" line).
- **Not started:** step 5. Write `docs/audit-2026-11.md`, file the gridlook
  issues in `eeholmes/gridlook` (ask Eli first; another repo), write the notes
  for an audit mode in `ocean-icechunks-skills`, and open the PR.
- **Main findings so far:**
  - Float `_FillValue` in the v3 stores is base64, xarray's encoding. The Zarr
    `fill_value` disagrees with the value actually on land. gridlook masks
    nothing in BICEP, Morlenn, CAREHeat metrics, 4DMED salinity and OHC.
  - Undeclared sentinels: WAPOSAL, an OHC covariance variable, 4DMED error
    fields and `ZEU`, plus a near-miss in BICEP.
  - Zarr `fill_value: 0` on flag and category variables masks every real 0.
  - Depth-last order in 4DMED primary production and biophysical: gridlook
    draws a lon × depth slice.
  - Very large map reads: BICEP and 4DMED primary production.
  - STAC: the 4DMED biophysical href is a 404, and BICEP and OHC have no usable
    licence.
- **Correction to the issue:** BICEP POC's land is masked. It looks wrong
  because a few extreme pixels (up to ~13,600 mg m⁻³, p99 ~300–500) stretch the
  min–max colour range. It is not a missing land flag.
- **gridlook-side issues to file** (not in the EarthCODE report):
  - base64 `_FillValue` is not decoded;
  - Zarr `fill_value` 0 masks real zeros;
  - the MITHO JSON error is hidden behind "Not a valid icechunk repository";
  - every v3 store costs 3 failed v2 requests before it opens.
- **Timing caveat:** CloudFerro latency roughly doubled partway through the
  timing run, so compare index and grid times only between nearby stores.

## Other open threads

- **MITHO** needs a data-side fix (bare `NaN` in `zarr.json`). Nobody has told
  the providers.
- **WAPOSAL** may be more clutter than use; Eli has not decided whether to keep
  all 31, one, or none.
- **Actions on Node 20.** The deploy log warns that `checkout@v4`,
  `setup-node@v4`, `upload-pages-artifact@v3` and `deploy-pages@v4` target Node
  20, which GitHub is retiring. Harmless for now.
- **gridlook-side idea:** taking the default dataset from the first catalog
  entry would retire `set_default_dataset.py`.

## Working notes

- Node 24 on this hub: `~/.local/opt/node-v24.20.0-linux-x64/bin`. The audit
  scripts run from a worktree of `~/gridlook` at `GRIDLOOK_REF` with its
  `node_modules` symlinked in (see the probe's header). Prettier is that
  checkout's `node_modules/.bin/prettier`.
- The value audit reads about 78 GB uncompressed (about 25 GB downloaded) and
  took 90 minutes. Use `ONLY=` to re-run a subset.
- `gh` here always gets `--repo eeholmes/gridlook-eh26`.
