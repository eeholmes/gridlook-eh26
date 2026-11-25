# AGENTS.md

Instructions for coding agents working in this repository. **Edit `AGENTS.md`,
not `CLAUDE.md`**: `CLAUDE.md` holds only the line `@AGENTS.md` so that Claude
Code, which reads only `CLAUDE.md`, sees the same text.

Read [`agent/handoff.md`](agent/handoff.md) first. Design decisions and their
evidence are in [`docs/design/`](docs/design/).

## What this repository is

A gridlook viewer for the ESA EarthCODE Ocean Hackathon (eh26) Zarr datasets,
published at <https://eeholmes.github.io/gridlook-eh26/>. It holds **no gridlook
code**: `catalog.json`, a deploy workflow, and two scripts. The workflow checks
out `eeholmes/gridlook` at the commit in `GRIDLOOK_REF`, replaces its default
catalog with `catalog.json`, builds, and deploys to GitHub Pages on every push
to `main`.

- A viewer bug or feature belongs in `eeholmes/gridlook` (or upstream
  `d70-t/gridlook`), not here. Ask before working in either.
- To pick up a newer gridlook, bump `GRIDLOOK_REF` and re-run the probe (below).

## Editing the catalog

`catalog.json` follows gridlook's catalog format
([`docs/catalogs.md`](https://github.com/eeholmes/gridlook/blob/main/docs/catalogs.md)).

- **The first entry is the viewer's default dataset.**
  `scripts/set_default_dataset.py` turns it into the startup `#hash`, `params`
  included, so reordering the catalog changes what the site opens on.
- Every entry carries the tags `project`, `region`, `format`, `layout`, `grid`
  and `license`; `tag` only for a status (`broken`, `along-track`). Tag values
  must be strings.
- Format with Prettier (`npx prettier --write catalog.json` from a gridlook
  checkout) to keep diffs small.
- A new or changed store is not done until it has been opened with
  `scripts/probe-catalog.test.ts`. Probe with gridlook's readers, never with
  `curl` on metadata files, which reports false failures. Check the host's
  `Access-Control-Allow-Origin` separately, since Node ignores CORS.

## Verifying

There is no test suite here. A change is checked by:

1. the probe (how to run it is in the script's header comment);
2. a gridlook build with the catalog swapped in, as the workflow does;
3. after merge, the deploy run succeeding and the live page's `<head>` carrying
   the expected `history.replaceState` hash.

None of these renders anything. Say plainly that browser rendering is unchecked
unless someone opened the page.

## Conventions

- Conventional Commits (`feat`, `fix`, `docs`, `chore`, …).
- Work on a branch and merge through a PR; never push to `main`.
- Credit gridlook: the README's `## Reuse and citation` section and the
  `LICENSE-gridlook.txt` step in the workflow are required by gridlook's MIT
  license and by the owner's wishes. Do not remove either.
- This repository's own files are CC0 (`LICENSE`). Do not relicense.
