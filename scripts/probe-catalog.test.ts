/**
 * Opens every catalog entry with gridlook's own reader code and reports, per
 * entry: whether it indexes, the detected grid type, the variable's shape, and
 * whether one chunk decodes. Node has no CORS, so check that separately.
 *
 * Runs inside a gridlook checkout, at the commit the workflow pins:
 *
 *   git -C ../gridlook worktree add /tmp/gl <GRIDLOOK_REF>
 *   ln -s ~/gridlook/node_modules /tmp/gl/node_modules
 *   cp scripts/probe-catalog.test.ts /tmp/gl/tests/
 *   cd /tmp/gl && CATALOG=$OLDPWD/catalog.json OUT=/tmp/probe.json \
 *     npx vitest run tests/probe-catalog.test.ts
 *
 * Needs Node 24 (zarrita uses Float16Array). Results go to $OUT as JSON,
 * because vitest swallows console output. Retry failures before believing
 * them: the first run on 2026-11-25 had a transient failure.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";

import "@/lib/data/codecs";
import { getGridType } from "@/lib/data/gridTypeDetector";
import { indexFromZarr } from "@/lib/data/sourceIndexing";
import { ZarrDataManager } from "@/lib/data/ZarrDataManager";

type TEntry = {
  title: string;
  url: string;
  params?: string | Record<string, string>;
};

function varnameOf(entry: TEntry): string | undefined {
  const p = entry.params;
  if (typeof p === "string") {
    return /(?:^|::)varname=([^:]+)/.exec(p)?.[1];
  }
  return p?.varname;
}

async function probe(entry: TEntry) {
  const out: Record<string, unknown> = {};
  const index = await indexFromZarr(entry.url);
  const vars = index.levels[0].datasources;
  const valid = Object.keys(vars).filter((v) => !vars[v].hidden);
  const varname = varnameOf(entry) ?? index.default_var ?? valid[0];
  out.varname = varname;
  const errs: string[] = [];
  out.gridType = await getGridType(true, varname, index, (e, c) =>
    errs.push(`${c}: ${String(e)}`),
  );
  if (errs.length) {
    out.gridErrs = errs;
  }
  const src = vars[varname];
  const arr = await ZarrDataManager.getVariableInfo(
    { store: src.store, dataset: src.dataset } as never,
    varname,
  );
  out.shape = arr.shape;
  try {
    await arr.getChunk(arr.shape.map(() => 0));
    out.chunk = "ok";
  } catch (e) {
    out.chunk = `FAIL ${String(e)}`;
  }
  return out;
}

test("probe catalog", { timeout: 3_600_000 }, async () => {
  const { datasets } = JSON.parse(
    readFileSync(process.env.CATALOG!, "utf8"),
  ) as {
    datasets: TEntry[];
  };
  const results = [];
  for (const entry of datasets) {
    let r: Record<string, unknown>;
    try {
      r = { title: entry.title, ...(await probe(entry)) };
    } catch (e) {
      r = { title: entry.title, error: String(e) };
    }
    results.push(r);
    writeFileSync(process.env.OUT!, JSON.stringify(results, null, 1));
  }
});
