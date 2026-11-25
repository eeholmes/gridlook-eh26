# gridlook-eh26

A [gridlook](https://github.com/eeholmes/gridlook) viewer whose catalog lists
the Zarr datasets prepared for the ESA EarthCODE Ocean Hackathon (eh26):
<https://esa-earthcode.github.io/ocean_hackathon/datasets/datasets-sumary/>.

**Viewer:** <https://eeholmes.github.io/gridlook-eh26/>

Open the catalog panel in the viewer to browse the datasets, filter them by
`project`, `region`, `grid`, `license` and the other tags, and open one on the
globe.

## What is here

| File | Purpose |
| --- | --- |
| `catalog.json` | The dataset catalog, in [gridlook's catalog format](https://github.com/eeholmes/gridlook/blob/main/docs/catalogs.md). |
| `.github/workflows/deploy.yml` | On every push to `main`, builds `eeholmes/gridlook` at the commit pinned in `GRIDLOOK_REF`, with `catalog.json` as its default catalog, and deploys it to GitHub Pages. |
| `scripts/set_default_dataset.py` | Makes the built viewer open the first catalog entry when the URL has no `#fragment`. |

No gridlook code lives in this repository. To pick up a newer gridlook, change
`GRIDLOOK_REF` in the workflow.

## The catalog

76 stores from the 17 Zarr datasets on the summary page (the Medicanes NetCDF
files and the Coastal Blue Carbon GeoPackages are not Zarr and are left out).
The URLs come from the EarthCODE STAC API
(`https://eoapi.workspace.earthcode.eox.at/stac/`, the `data` asset of every item
in each dataset's collection), and from the access notebooks in
[`esa-earthcode/ocean_hackathon/1_Datasets`](https://github.com/esa-earthcode/ocean_hackathon/tree/main/1_Datasets)
for the stores that are not in STAC (SCOPE) or whose STAC link is wrong
(4DMED-SEA 3D biophysical). Every collection was listed in full, so the catalog
has stores the notebooks never open, such as all 31 WAPOSAL tracks and every
OceanSODA-ETHZ v2 variable.

| Project | Stores | Region |
| --- | --- | --- |
| 4DMED-SEA | 9 | Mediterranean |
| WOC | 1 | North Atlantic |
| Atlantic OHC | 1 | Global |
| OceanSODA-ETHZ | 11 | Global |
| WAPOSAL | 31 | Coastal sites (along-track) |
| MITHO | 3 | Global (do not open, see below) |
| BICEP | 4 | Global |
| CAREHeat | 5 | Global, Mediterranean |
| BOOMS | 4 | Global, Atlantic, Southern Ocean |
| CoastDyn | 1 | Europe |
| UpperDyn | 2 | North Atlantic |
| SCOPE | 4 | Mediterranean |

Each entry sets a default variable (`params.varname`) where the store's first
variable is a poor starting point, and carries the dataset's licence as a tag.
Licences differ between datasets (several are non-commercial), so check the
`license` tag and the dataset's OSC entry before reusing data.

### How it was checked (2026-11-25)

Every store was opened from Node with gridlook's own code (`indexFromZarr`,
`getGridType` and `ZarrDataManager` at `GRIDLOOK_REF`), and one chunk of its
default variable was read and decoded. Both hosting buckets
(`s3.waw4-1.cloudferro.com/EarthCODE` and `deep-esdl-public` on AWS) send
`Access-Control-Allow-Origin: *`. The production build was run with this
catalog. **No entry has been opened in a browser yet**, so rendering is
unverified.

### Known problems

- **MITHO (3 stores) do not open.** Their `zarr.json` contains a bare `NaN`
  (`"missing_value": NaN`), which Python's JSON parser accepts and the browser's
  `JSON.parse` rejects. They are listed with the `broken` tag. The fix is on the
  data side: write the attribute as a string or drop it.
- **WAPOSAL (31 stores) is along-track data**, dimensioned `trajectory × obs`,
  not a grid. gridlook detects it as curvilinear and will draw it as a mesh
  between neighbouring tracks, which is not meaningful; the largest tracks are
  also tens of millions of points. Tagged `along-track`.
- **The 4DMED-SEA 3D biophysical store's STAC link is dead.** STAC points at
  `ocean_datasets/4dmed-bp.zarr`, which returns 404; the catalog uses the
  notebook's `4dmed/4dmed-bp.zarr`.
- **Very large slices.** BICEP POC and the BOOMS T1/T2 stores are 4320 × 8640
  per time step, which may be slow or exceed GPU texture limits.
- **Dimension order.** The 4DMED-SEA primary production and 3D biophysical
  variables put `depth` last, and the BOOMS 4D stores order `longitude` before
  `latitude`. Both are worth a look in the browser.
