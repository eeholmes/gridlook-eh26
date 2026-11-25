"""Make the built viewer open the catalog's first dataset when the URL has no #fragment.

gridlook falls back to a hard-coded demo dataset otherwise. The app reads
location.hash at startup, so setting it in a script placed before the app's own
module is enough; replaceState adds no history entry.

Usage: python3 set_default_dataset.py catalog.json dist/index.html
"""

import json
import sys


def fragment(entry: dict) -> str:
    params = entry.get("params") or {}
    if isinstance(params, str):
        params = dict(p.split("=", 1) for p in params.split("::") if p)
    return "::".join([entry["url"], *(f"{k}={v}" for k, v in params.items())])


def main(catalog_path: str, index_path: str) -> None:
    first = json.load(open(catalog_path))["datasets"][0]
    script = (
        "<script>if (location.hash.length < 2) "
        f"history.replaceState(null, \"\", {json.dumps('#' + fragment(first))});</script>"
    )
    html = open(index_path).read()
    if "<head>" not in html:
        sys.exit(f"no <head> in {index_path}")
    open(index_path, "w").write(html.replace("<head>", "<head>\n    " + script, 1))
    print(f"default dataset: {first['title']}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
