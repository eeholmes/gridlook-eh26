/**
 * Opens every catalog entry with gridlook's own reader code and records, per
 * entry: whether it indexes, the detected grid type, how long each stage of
 * opening takes and how many requests and bytes it costs, and the metadata of
 * every array in the store. Node has no CORS, so check that separately.
 *
 * Runs inside a gridlook checkout, at the commit the workflow pins:
 *
 *   git -C ../gridlook worktree add /tmp/gl <GRIDLOOK_REF>
 *   ln -s ~/gridlook/node_modules /tmp/gl/node_modules
 *   cp scripts/probe-catalog.test.ts /tmp/gl/tests/
 *   cd /tmp/gl && CATALOG=$OLDPWD/catalog.json OUT=/tmp/probe.json \
 *     npx vitest run tests/probe-catalog.test.ts
 *
 * Optional: RUNS (default 3) timed runs per entry, of which the report uses
 * the median; ONLY, a regular expression on titles, to probe a subset.
 *
 * Needs Node 24 (zarrita uses Float16Array). Results go to $OUT as JSON,
 * because vitest swallows console output. Retry failures before believing
 * them: the first run on 2026-11-25 had a transient failure.
 *
 * The timed stages follow what gridlook does when a dataset is opened:
 * `indexFromZarr`, then `getGridType`, then one read of the first 2-D map of
 * the entry's variable (the last two dimensions for regular and curvilinear
 * grids, the last one for the others, every other dimension at its start
 * index, taken from `dimIndices_<dim>` in the entry's params when set).
 * Each run starts from empty caches. Coordinate reads that gridlook makes
 * while building the mesh are not included, so the map stage is a lower bound.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import * as zarr from "zarrita";

import "@/lib/data/codecs";
import { getGridType } from "@/lib/data/gridTypeDetector";
import { indexFromZarr } from "@/lib/data/sourceIndexing";
import { ZarrDataManager } from "@/lib/data/ZarrDataManager";

type TEntry = {
  title: string;
  url: string;
  params?: string | Record<string, string>;
};

type TArray = zarr.Array<zarr.DataType, zarr.AsyncReadable>;

// Attributes clients use to mask, unpack, label and place values.
const ATTRS = [
  "_FillValue",
  "missing_value",
  "valid_min",
  "valid_max",
  "valid_range",
  "actual_range",
  "scale_factor",
  "add_offset",
  "flag_values",
  "flag_meanings",
  "flag_masks",
  "units",
  "standard_name",
  "long_name",
  "axis",
  "positive",
  "coordinates",
  "grid_mapping",
  "calendar",
  "_ARRAY_DIMENSIONS",
];

// Counts every request and its response bytes. Responses are buffered so
// their size is known; zarrita reads them whole anyway.
const traffic = { requests: 0, bytes: 0, failed: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const res = await realFetch(input, init);
  const buf = await res.arrayBuffer();
  traffic.requests++;
  traffic.bytes += buf.byteLength;
  if (!res.ok) {
    traffic.failed++;
  }
  return new Response(buf, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
};

function paramsOf(entry: TEntry): Record<string, string> {
  const p = entry.params;
  if (typeof p === "string") {
    return Object.fromEntries(
      p.split("::").map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i), kv.slice(i + 1)];
      }),
    );
  }
  return p ?? {};
}

function dimNamesOf(arr: TArray): string[] {
  return (
    arr.dimensionNames ??
    (arr.attrs._ARRAY_DIMENSIONS as string[] | undefined) ??
    []
  );
}

// The selection gridlook reads for the first map of a variable.
function mapSelection(
  arr: TArray,
  gridType: string,
  p: Record<string, string>,
) {
  const n = arr.shape.length;
  const spatial =
    gridType === "regular" ||
    gridType === "regular_rotated" ||
    gridType === "curvilinear"
      ? [n - 2, n - 1]
      : [n - 1];
  const names = dimNamesOf(arr);
  return arr.shape.map((size, i) => {
    if (spatial.includes(i)) {
      return null;
    }
    const preset = Number(p[`dimIndices_${names[i]}`]);
    return Number.isFinite(preset)
      ? Math.min(Math.max(preset, 0), size - 1)
      : 0;
  });
}

function describe(arr: TArray) {
  const attrs: Record<string, unknown> = {};
  for (const k of ATTRS) {
    if (Object.hasOwn(arr.attrs, k)) {
      attrs[k] = arr.attrs[k];
    }
  }
  return {
    dtype: arr.dtype,
    shape: arr.shape,
    chunks: arr.chunks,
    dims: dimNamesOf(arr),
    zarrFillValue: arr.fillValue,
    attrs,
  };
}

// Chunks and uncompressed bytes one read of `selection` touches.
function chunkCost(arr: TArray, selection: (number | null)[]) {
  let chunks = 1;
  let elements = 1;
  arr.shape.forEach((size, i) => {
    const c = arr.chunks[i];
    if (selection[i] === null) {
      chunks *= Math.ceil(size / c);
      elements *= Math.ceil(size / c) * c;
    } else {
      elements *= c;
    }
  });
  const itemsize = Number(/\d+/.exec(arr.dtype)?.[0] ?? 8) / 8;
  return { chunks, uncompressedBytes: elements * itemsize };
}

async function stage<T>(fn: () => Promise<T>) {
  const r0 = traffic.requests;
  const b0 = traffic.bytes;
  const f0 = traffic.failed;
  const t0 = performance.now();
  const value = await fn();
  return {
    value,
    cost: {
      ms: Math.round(performance.now() - t0),
      requests: traffic.requests - r0,
      bytes: traffic.bytes - b0,
      failedRequests: traffic.failed - f0,
    },
  };
}

async function timedRun(entry: TEntry) {
  ZarrDataManager.invalidateCache();
  const p = paramsOf(entry);
  const index = await stage(() => indexFromZarr(entry.url));
  const vars = index.value.levels[0].datasources;
  const valid = Object.keys(vars).filter((v) => !vars[v].hidden);
  const varname = p.varname ?? index.value.default_var ?? valid[0];
  const errs: string[] = [];
  const grid = await stage(() =>
    getGridType(true, varname, index.value, (e, c) =>
      errs.push(`${c}: ${String(e)}`),
    ),
  );
  const src = vars[varname];
  const map = await stage(async () => {
    const arr = await ZarrDataManager.getVariableInfo(
      { store: src.store, dataset: src.dataset } as never,
      varname,
    );
    const selection = mapSelection(arr, grid.value, p);
    const data = await ZarrDataManager.getVariableDataFromArray(arr, selection);
    return { arr, selection, mapShape: data.shape };
  });
  return {
    index: index.value,
    varname,
    gridType: grid.value,
    gridErrs: errs,
    ...map.value,
    cost: { index: index.cost, grid: grid.cost, map: map.cost },
  };
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function probe(entry: TEntry, runs: number) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(await timedRun(entry));
  }
  const first = results[0];
  const stages = ["index", "grid", "map"] as const;
  const costs = results.map((r) => r.cost);
  const medianMs = Object.fromEntries(
    stages.map((s) => [s, median(costs.map((c) => c[s].ms))]),
  );
  const totals = costs.map((c) => c.index.ms + c.grid.ms + c.map.ms);

  // Metadata of every array the index lists, read through gridlook's reader.
  const vars = first.index.levels[0].datasources;
  const arrays: Record<string, unknown> = {};
  for (const [name, src] of Object.entries(vars)) {
    try {
      const arr = await ZarrDataManager.getVariableInfo(
        { store: src.store, dataset: src.dataset } as never,
        name,
      );
      arrays[name] = { hidden: Boolean(src.hidden), ...describe(arr) };
    } catch (e) {
      arrays[name] = { error: String(e) };
    }
  }

  return {
    varname: first.varname,
    gridType: first.gridType,
    ...(first.gridErrs.length ? { gridErrs: first.gridErrs } : {}),
    shape: first.arr.shape,
    selection: first.selection,
    mapShape: first.mapShape,
    mapChunks: chunkCost(first.arr, first.selection),
    timing: {
      runs,
      medianMs,
      medianTotalMs: median(totals),
      perRun: costs,
    },
    arrays,
  };
}

// JSON has no NaN, Infinity or BigInt; keep them visible as strings.
function replacer(_k: string, v: unknown) {
  if (typeof v === "bigint") {
    return `${v}n`;
  }
  if (typeof v === "number" && !Number.isFinite(v)) {
    return String(v);
  }
  return v;
}

test("probe catalog", { timeout: 6 * 3_600_000 }, async () => {
  const { datasets } = JSON.parse(
    readFileSync(process.env.CATALOG!, "utf8"),
  ) as {
    datasets: TEntry[];
  };
  const runs = Number(process.env.RUNS ?? 3);
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : undefined;
  const results = [];
  for (const entry of datasets) {
    if (only && !only.test(entry.title)) {
      continue;
    }
    const startedAt = new Date().toISOString();
    let r: Record<string, unknown>;
    try {
      r = {
        title: entry.title,
        url: entry.url,
        startedAt,
        ...(await probe(entry, runs)),
      };
    } catch (e) {
      r = { title: entry.title, url: entry.url, startedAt, error: String(e) };
    }
    results.push(r);
    writeFileSync(process.env.OUT!, JSON.stringify(results, replacer, 1));
  }
});
