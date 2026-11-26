# Browser checklist for the November 2026 data audit

Part of the data audit in issue #4. The automated checks read every store from
Node with gridlook's readers. They cannot see the rendered map, so this list asks
for one look per dataset, plus a few extra stores where the checks made a
specific prediction.

Each link opens the live viewer on that store's catalog view. For each, note:

- **Loads?** Whether it loads at all, and roughly how long until the map shows.
- **Histogram / colour range.** The range the colour bar starts with. The
  "Expect" line gives what the automated check computed gridlook would show.
- **Land.** Is land drawn blank (masked), or as a colour?
- **Orientation.** Are coastlines where they should be, the right way up and
  not mirrored?

Write what you saw on the "Saw:" line. "As expected" is enough when it was.

## Stores where the checks predict a problem

1. [ ] **4DMED-SEA salinity** (`sos`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/sssd.zarr::varname=sos)
   - Expect: range −32767 to 39.3 and land coloured, because land holds −32767,
     declared only in a base64 `_FillValue` that gridlook does not decode.
   - Saw:
2. [ ] **4DAtlantic ocean heat content** (`ohc`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/ocean_heat.zarr::varname=ohc)
   - Expect: range −1.1e10 to 1e25, land coloured (1e25, same cause).
   - Saw:
3. [ ] **BICEP particulate organic carbon** (`POC`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/bicep/particulate_organic_carbon_geo.zarr::varname=POC)
   - Expect: land blank (it is NaN), but range 2.2 to 8473 while 99% of values
     are below 317, so the map looks almost uniformly dark. Latitude is stored
     north to south: check it is not upside down. 4320 × 8640, about 30 s to
     load from the hub.
   - Saw:
4. [ ] **UpperDyn Morlenn mixed layer, baseline** (`mld`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/upperdyn-morlenn/morlenn_baseline.zarr::varname=mld)
   - Expect: range 0.25 to 9.97e36, land coloured (base64 `_FillValue`).
   - Saw:
5. [ ] **CAREHeat marine heatwave metrics** (`intensity_max`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/careheat_mhw_metrics_2d.zarr::varname=intensity_max)
   - Expect: range −999 to 8.8, land coloured (base64 `_FillValue` −999).
   - Saw:
6. [ ] **CAREHeat marine heatwave category** (`category`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/careheat_mhw_2d.zarr::varname=category)
   - Expect: land blank. Category 0 ("no heatwave") is **also blank**, because the
     Zarr `fill_value` is 0, so ocean without a heatwave looks like land.
   - Saw:
7. [ ] **4DMED-SEA primary production** (`PP`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/4dmed-pp.zarr::varname=PP)
   - Expect: no sensible map. Dimensions are (time, lat, lon, depth), so gridlook
     treats lon × depth as the map. The slice it opens on is all NaN. One read
     fetches about 477 MB.
   - Saw:
8. [ ] **4DMED-SEA 3D biophysical fields** (`0/CHL3D`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/4dmed/4dmed-bp.zarr::varname=0/CHL3D)
   - Expect: same as primary production (depth last), all NaN.
   - Saw:
9. [ ] **BOOMS 4D seascapes, Atlantic** (`mode_seascape_4D`)
       — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/booms/seascape-t3-4d-atlantic.zarr)
   - Expect: dimensions are (…, longitude, latitude), and `longitude` is labelled
     `axis: "Y"`. Look for a transposed or mirrored Atlantic. Range 1 to 9.
   - Saw:
10. [ ] **OceanSODA-ETHZ v1 carbonate system** (`ph_total`)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean-soda/ocean-soda.zarr::varname=ph_total)
    - Expect: an empty map at the first time step (all NaN). Step 1 onward has
      data; check that moving the time slider one step shows it.
    - Saw:
11. [ ] **4DMED-SEA MIOST Lagrangian eddies** (`fsle`)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/fsle.zarr::varname=fsle)
    - Expect: range 0 to 0.99. 80% of cells are exactly 0 and nothing is
      masked. The question is whether land is 0 (coloured like calm sea) or
      whether the zeros are real ocean values.
    - Saw:
12. [ ] **WAPOSAL AZ CS2** (`SWH_20Hz`, the smallest along-track store)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/waposal/AZ-CS2.zarr::varname=SWH_20Hz)
    - Expect: range −0.5 to 30 m. Drawn as a mesh joining neighbouring tracks
      (curvilinear), which does not mean anything.
    - Saw:
13. [ ] **MITHO CHI2**
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/mitho/chi2_2004_2022.zarr)
    - Expect: fails with "Not a valid icechunk repository" (the real cause is a
      bare `NaN` in `zarr.json`). Note the exact message shown.
    - Saw:

## Controls the checks found clean

These should look right. If one does not, the automated checks are missing
something.

14. [ ] **4DMED-SEA 4DVarNet 1/8°** (`adt`, int32 with a plain-number fill)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/4dvarnet.zarr::varname=adt)
    - Expect: range −0.22 to 0.25 m, land blank.
    - Saw:
15. [ ] **CoastDyn MIOST L4** (`adt`)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/coastdyn/coastdyn-miost-l4.zarr::varname=adt)
    - Expect: range −0.57 to 1.0 m, land blank.
    - Saw:
16. [ ] **4DMED-SEA phytoplankton functional types** (`DIATO`)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/4dmed-2d-pft.zarr::varname=DIATO)
    - Expect: range 0.001 to 3.04, land blank.
    - Saw:
17. [ ] **4DMED-SEA 3D physical fields** (`to`)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/tsgeo150.zarr::varname=to)
    - Expect: range 13.7 to 20.4 °C, land blank, a depth slider.
    - Saw:
18. [ ] **WOC total surface current at 15 m** (`ut_woc`)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean_datasets/woc.zarr::varname=ut_woc)
    - Expect: range −0.37 to 0.53 m/s, land blank.
    - Saw:
19. [ ] **OceanSODA-ETHZ v2 fgco2** (the per-variable store, not the pyramid)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/ocean-soda/fgco2.zarr)
    - Expect: range −29 to 35, land blank. Latitude ascending here and descending
      in the pyramid (the site's default view), so the two should match.
    - Saw:
20. [ ] **SCOPE surface carbonate system** (`fco2`, Zarr v2 on AWS)
        — [open](https://eeholmes.github.io/gridlook-eh26/#https://deep-esdl-public.s3.eu-central-1.amazonaws.com/SCOPE/mediterranean/surface_carbonate_system_v2026_1.zarr::varname=fco2)
    - Expect: range 306 to 430, land blank, 1° Mediterranean grid.
    - Saw:
