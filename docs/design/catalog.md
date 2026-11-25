# How the catalog was built, and why it looks the way it does

Written 2026-11-25, when the catalog was first made (PRs #1 and #2).

## Source of the URLs

The summary page,
<https://esa-earthcode.github.io/ocean_hackathon/datasets/datasets-sumary/>,
lists 19 datasets. 17 are Zarr. Medicanes (NetCDF) and Coastal Blue Carbon
(GeoPackage) are not and were left out. The repo's `1_Datasets/` folder also has
`sarwave`, which is not on the summary page, so it was left out too.

Most access notebooks do not contain a URL. They ask the EarthCODE STAC API,
`https://eoapi.workspace.earthcode.eox.at/stac/`, for an item and open its
`data` asset. So the catalog lists the `data` asset of **every item** in each
dataset's collection, not only the items the notebooks open. That is why WAPOSAL
has 31 entries (11 sites × S3A/S3B, 9 for CryoSat-2) and OceanSODA-ETHZ has 11.

| Collection(s)                                                                                                                                                             | Notes                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `4dmed-2d-sss`, `4dmed-2d-alt-miost-le-24`, `4dmed-2d-alt-varnet-8`, `4dmed-2d-alt-varnet-20`, `4dmed-2d-pft-kd` (2 items), `4dmed-t-s-geo-150`, `4dmed-3d-prim-prod-150` | 4DMED-SEA                                                                                                                                                          |
| `4dmed-t-s-geo-a-150`                                                                                                                                                     | **STAC href is a 404** (`ocean_datasets/4dmed-bp.zarr`). The notebook's `4dmed/4dmed-bp.zarr` works and is what the catalog uses.                                  |
| `total-surface-current-15`                                                                                                                                                | WOC                                                                                                                                                                |
| `4d-atlantic-ohc-global`                                                                                                                                                  | One Zarr item, one NetCDF item; only the Zarr is listed.                                                                                                           |
| `ocean-soda-ethz`, `oceansoda-ethz-v2`                                                                                                                                    | v1 store, nine v2 per-variable stores, and the v2 GCB pyramid.                                                                                                     |
| `waposal-waves`                                                                                                                                                           | 31 along-track stores.                                                                                                                                             |
| `global-cumulative-hazard-indexes-chis`                                                                                                                                   | MITHO, 3 stores, broken (below).                                                                                                                                   |
| `bicep-database`, `careheat-database`, `booms-dataset`, `morlenn_mld`, `coastdyn-adt-rep-2d-dataset`                                                                      | The page's links say `projects/coastdyn` but the STAC collection is `coastdyn-adt-rep-2d-dataset`.                                                                 |
| SCOPE                                                                                                                                                                     | Not in STAC. Four stores on `deep-esdl-public` from the notebook; it opens three with xarray and lists `global_open_ocean_doc.zarr` through xcube's store listing. |

## Checks and what they found

Every store was opened from Node with gridlook's own code at `GRIDLOOK_REF`
(`scripts/probe-catalog.test.ts`). The script indexes the store, detects the grid
for the entry's variable, and decodes one chunk. Both hosts send
`Access-Control-Allow-Origin: *`.

- **MITHO cannot be opened.** Its `zarr.json` has `"missing_value": NaN`, a
  bare `NaN` that Python's JSON parser accepts and `JSON.parse` rejects, so zarrita
  reports "Failed to decode JSON". gridlook's auto-detection then falls through
  to its Icechunk reader, so the error a user sees, "Not a valid icechunk
  repository", hides the real cause. The fix is on the data side. The stores
  stay in the catalog, tagged `broken`, because they are on the summary page.
- **WAPOSAL is along-track data** (`trajectory × obs`, 2-D lat/lon). gridlook
  calls it curvilinear and would mesh neighbouring tracks together, which means
  nothing. The largest stores reach 21047 × 5495. They are listed, tagged
  `along-track`, because they are Zarr stores on the summary page. Grid detection
  on `WAPOSAL MT CS2` failed on two of three runs and passed on the other.
- **The first probe run had a transient failure** (4DMED biophysical), which
  passed on retry. Retry before calling a store broken.
- **Multiscale stores open at the root.** 4DMED biophysical and the OceanSODA
  v2 pyramid have resolution groups `0`, `1`, `2` without consolidated metadata
  of their own, so `…/0` fails and the root URL works. Their entries use
  `varname=0/…`, the finest level.

## Decisions

- **No gridlook code here; build from a pinned commit.** The same approach as
  `publish_viewer.py` in `ocean-icechunks/icechunks`, which publishes gridlook
  builds for other products. It keeps the viewer's code in one place, and a pinned
  ref means a gridlook change cannot alter the site until someone bumps it.
- **Default dataset by injected `#hash`.** gridlook hard-codes
  `DEFAULT_DATASET` in `HashGlobeView.vue`, so a bare URL would open an unrelated
  demo. `set_default_dataset.py` adds a script to `index.html` that sets the hash
  from the first catalog entry before the app reads it. The default is the
  OceanSODA v2 fgco2 pyramid with a camera view Eli chose in the browser (PR #2);
  those view settings live in that entry's `params`, so opening it from the
  catalog panel jumps to the same view.
- **Default variables.** Where a store's first variable is a poor start
  (`cell_surface` for OHC, `assim_mask` for Morlenn, `dos` for salinity),
  `params.varname` picks a better one.
- **Licence as a tag.** Licences differ, several are non-commercial, and SCOPE
  states none ("not stated"). A filterable tag makes that visible.
- **Crediting gridlook.** Eli asked that gridlook be credited and cited, since it
  is not her product. The README cites it by its license holder (MPI-M and DKRZ),
  because gridlook publishes no citation file. The workflow ships gridlook's
  `LICENSE` as `LICENSE-gridlook.txt`, because the site is a copy of gridlook and
  MIT requires the notice to go with it.
