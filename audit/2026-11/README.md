# Raw output of the November 2026 data audit

Machine output behind `docs/audit-2026-11.md` (issue #4), kept so the audit can
be re-run and compared after a provider fixes something. Run on 2026-11-26 from
a JupyterHub in AWS us-west against gridlook at `GRIDLOOK_REF` `a2f6ed5`.

| File            | Made by                                       | What it holds                                                                                                                                                    |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe.json`    | `scripts/probe-catalog.test.ts`, `RUNS=3`     | Per store: grid type, timings of index / grid / first map with requests and bytes, and every array's dtype, chunks and attributes.                               |
| `values.json`   | `scripts/audit-values.test.ts`, `MAX_MB=2500` | Per variable and map: value statistics, most common values with their bits, sentinels and whether they match a declared fill, and what gridlook masks and shows. |
| `metadata.json` | `scripts/audit-metadata.test.ts`              | Strict-JSON check of root metadata, consolidation, group attributes, and coordinate order and ranges.                                                            |
| `stac.json`     | `scripts/audit-stac.py`                       | STAC licences, href resolution and CORS headers.                                                                                                                 |
| `nan-scan.json` | a one-off check, not kept as a script         | Fraction NaN along one dimension for the maps found entirely NaN.                                                                                                |

`values.json` merges a retry of four stores (4DMED biophysical, WAPOSAL MT CS2,
FP S3A, MT S3A) whose first reads failed with network drops or a since-fixed
limit in the script. NaN, Infinity and BigInt values are written as strings.

CloudFerro latency roughly doubled partway through the timing run (from
about the BICEP stores on), so compare index and grid times only between stores
run close together; request counts compare everywhere.
