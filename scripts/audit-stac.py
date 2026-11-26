"""STAC and access checks for the data audit (issue #4).

For each EarthCODE collection behind the catalog: the collection licence and
licence links, and whether every Zarr `data` asset href resolves (HEAD on
zarr.json, .zmetadata or .zgroup). Also records the CORS headers both hosts
send to a GitHub Pages origin, for a plain GET and a Range preflight.

Standard library only. Usage: python3 -I scripts/audit-stac.py OUT.json
A NetCDF asset is reported as not resolving because it has no Zarr metadata;
check those by hand.
"""
import json, sys, urllib.request, urllib.error
API = "https://eoapi.workspace.earthcode.eox.at/stac"
COLS = ["4dmed-2d-sss","4dmed-2d-alt-miost-le-24","4dmed-2d-alt-varnet-8","4dmed-2d-alt-varnet-20","4dmed-2d-pft-kd","4dmed-t-s-geo-150","4dmed-3d-prim-prod-150","4dmed-t-s-geo-a-150","total-surface-current-15","4d-atlantic-ohc-global","ocean-soda-ethz","oceansoda-ethz-v2","waposal-waves","global-cumulative-hazard-indexes-chis","bicep-database","careheat-database","booms-dataset","morlenn_mld","coastdyn-adt-rep-2d-dataset"]
def get(url, method="GET", headers=None):
    req = urllib.request.Request(url, method=method, headers=headers or {"User-Agent": "stac-audit"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers), (r.read() if method == "GET" else b"")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), b""
    except Exception as e:
        return str(e), {}, b""
def probe_href(h):
    base = h.rstrip("/")
    for f in ("zarr.json", ".zmetadata", ".zgroup"):
        s, _, _ = get(f"{base}/{f}", "HEAD")
        if s == 200:
            return f"200 {f}"
    return f"no zarr.json/.zmetadata/.zgroup ({s})"
out = []
for c in COLS:
    s, _, body = get(f"{API}/collections/{c}")
    col = json.loads(body) if s == 200 else {}
    rec = {"collection": c, "status": s, "license": col.get("license"),
           "license_links": [l.get("href") for l in col.get("links", []) if l.get("rel") == "license"], "items": []}
    s, _, body = get(f"{API}/collections/{c}/items?limit=100")
    items = json.loads(body).get("features", []) if s == 200 else []
    for it in items:
        for k, a in it.get("assets", {}).items():
            if k == "data" or "zarr" in (a.get("type") or "") or a.get("href", "").rstrip("/").endswith(".zarr"):
                href = a["href"]
                rec["items"].append({"item": it["id"], "asset": k, "href": href, "type": a.get("type"),
                                     "resolves": probe_href(href) if href.startswith("http") else "not http",
                                     "item_license": it.get("properties", {}).get("license")})
    out.append(rec)
    print(c, rec["status"], rec["license"], len(rec["items"]), [i["resolves"] for i in rec["items"] if not str(i["resolves"]).startswith("200")], file=sys.stderr)
cors = {}
for u in ["https://s3.waw4-1.cloudferro.com/EarthCODE/OSCAssets/bicep/particulate_organic_carbon_geo.zarr/zarr.json",
          "https://deep-esdl-public.s3.eu-central-1.amazonaws.com/SCOPE/mediterranean/global_coastal_doc.zarr/.zmetadata"]:
    s, h, _ = get(u, "GET", {"Origin": "https://eeholmes.github.io", "User-Agent": "stac-audit"})
    hl = {k.lower(): v for k, v in h.items()}
    s2, h2, _ = get(u, "OPTIONS", {"Origin": "https://eeholmes.github.io", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "range", "User-Agent": "stac-audit"})
    h2l = {k.lower(): v for k, v in h2.items()}
    cors[u] = {"get": s, "acao": hl.get("access-control-allow-origin"), "expose": hl.get("access-control-expose-headers"),
               "preflight": s2, "preflight_acao": h2l.get("access-control-allow-origin"), "preflight_allow_headers": h2l.get("access-control-allow-headers"), "preflight_methods": h2l.get("access-control-allow-methods")}
json.dump({"stac": out, "cors": cors}, open(sys.argv[1], "w"), indent=1)
print(json.dumps(cors, indent=1), file=sys.stderr)
