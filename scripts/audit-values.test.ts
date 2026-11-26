/**
 * Reads 2-D maps of every catalog entry with gridlook's own readers and records
 * what the stored values look like: how missing cells are written, whether that
 * matches what the metadata declares, and the range gridlook would show.
 *
 * Runs the same way as `probe-catalog.test.ts` (see its header), with this file
 * copied into the gridlook checkout's `tests/`, and the same CATALOG, OUT and
 * ONLY variables. MAX_MB (default 600) skips maps whose read would download
 * more uncompressed chunk data than that.
 *
 * For the entry's variable it reads three maps: the first, middle and last
 * index of the first non-spatial dimension (usually time). Other data
 * variables in the store get the first map only. Values are taken as stored,
 * before CF decoding, so that a land cell's bits can be compared with the
 * declared fill value; CF readers mask by exact equality.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import * as zarr from "zarrita";

import "@/lib/data/codecs";
import { getGridType } from "@/lib/data/gridTypeDetector";
import { indexFromZarr } from "@/lib/data/sourceIndexing";
import {
  castDataVarToFloat32,
  decodeVariableDataAndGetBounds,
  getFillValue,
  getMissingValue,
} from "@/lib/data/variableDecoding";
import { ZarrDataManager } from "@/lib/data/ZarrDataManager";

type TEntry = {
  title: string;
  url: string;
  params?: string | Record<string, string>;
};
type TArray = zarr.Array<zarr.DataType, zarr.AsyncReadable>;
type TNum = ArrayLike<number> & { length: number };

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

function spatialDims(arr: TArray, gridType: string) {
  const n = arr.shape.length;
  return gridType === "regular" ||
    gridType === "regular_rotated" ||
    gridType === "curvilinear"
    ? [n - 2, n - 1]
    : [n - 1];
}

function itemsize(arr: TArray) {
  return Number(/\d+/.exec(arr.dtype)?.[0] ?? 8) / 8;
}

function uncompressedMB(arr: TArray, selection: (number | null)[]) {
  let elements = 1;
  arr.shape.forEach((size, i) => {
    const c = arr.chunks[i];
    elements *= selection[i] === null ? Math.ceil(size / c) * c : c;
  });
  return (elements * itemsize(arr)) / 1e6;
}

// Bits of a value as stored, so near-misses against a fill value show.
function bitsOf(v: number, dtype: string) {
  if (dtype === "float32") {
    const b = new DataView(new ArrayBuffer(4));
    b.setFloat32(0, v);
    return `0x${b.getUint32(0).toString(16).padStart(8, "0")}`;
  }
  if (dtype === "float64") {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, v);
    return `0x${b.getBigUint64(0).toString(16).padStart(16, "0")}`;
  }
  return String(v);
}

// xarray writes float `_FillValue` in Zarr v3 attributes as base64 of the
// little-endian bytes. Decode it so it can be compared with the data.
function attrNumber(
  v: unknown,
): { value: number; base64?: string } | undefined {
  if (typeof v === "number") {
    return { value: v };
  }
  if (typeof v === "string") {
    if (
      /^[A-Za-z0-9+/]+=*$/.test(v) &&
      v.length % 4 === 0 &&
      Number.isNaN(Number(v))
    ) {
      const bytes = Buffer.from(v, "base64");
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (bytes.length === 8) {
        return { value: dv.getFloat64(0, true), base64: v };
      }
      if (bytes.length === 4) {
        return { value: dv.getFloat32(0, true), base64: v };
      }
    }
    const n = Number(v);
    return Number.isNaN(n) && v.toLowerCase() !== "nan"
      ? undefined
      : { value: n };
  }
  if (Array.isArray(v) && v.length === 1) {
    return attrNumber(v[0]);
  }
  return undefined;
}

function sameValue(a: number, b: number) {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

function quantile(sorted: Float64Array, q: number) {
  if (!sorted.length) {
    return NaN;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const DISTINCT_CAP = 4_000_000;

function stats(raw: TNum, dtype: string) {
  const n = raw.length;
  let nan = 0;
  let inf = 0;
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const v = Number(raw[i]);
    if (Number.isNaN(v)) {
      nan++;
      continue;
    }
    if (!Number.isFinite(v)) {
      inf++;
    }
    // A JS Map holds at most 2^24 keys, and the largest along-track maps
    // have more distinct values. Past the cap only values already seen are
    // counted; a sentinel common enough to matter is seen long before that.
    const c = counts.get(v);
    if (c !== undefined) {
      counts.set(v, c + 1);
    } else if (counts.size < DISTINCT_CAP) {
      counts.set(v, 1);
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({
      value,
      bits: bitsOf(value, dtype),
      fraction: +(count / n).toFixed(4),
    }));
  const finite = new Float64Array(n - nan - inf);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(raw[i]);
    if (Number.isFinite(v)) {
      finite[j++] = v;
    }
  }
  finite.sort();
  return {
    cells: n,
    nanFraction: +(nan / n).toFixed(4),
    infCount: inf,
    distinct: counts.size,
    min: finite[0],
    max: finite[finite.length - 1],
    p01: quantile(finite, 0.01),
    p50: quantile(finite, 0.5),
    p99: quantile(finite, 0.99),
    top,
  };
}

// A value that is very common and sits at an end of the distribution is how
// an unflagged land or missing marker shows up.
function sentinelCandidates(s: ReturnType<typeof stats>) {
  return s.top.filter(
    (t) =>
      t.fraction >= 0.01 &&
      (t.value === s.min || t.value === s.max || Math.abs(t.value) >= 1e15),
  );
}

function declared(arr: TArray) {
  const a = arr.attrs;
  const out: Record<string, unknown> = { zarrFillValue: arr.fillValue };
  for (const k of ["_FillValue", "missing_value"]) {
    if (Object.hasOwn(a, k)) {
      out[k] = attrNumber(a[k]) ?? { unparsed: a[k] };
    }
  }
  for (const k of [
    "valid_min",
    "valid_max",
    "valid_range",
    "scale_factor",
    "add_offset",
    "flag_values",
    "units",
  ]) {
    if (Object.hasOwn(a, k)) {
      out[k] = a[k];
    }
  }
  return out;
}

async function readMap(arr: TArray, selection: (number | null)[]) {
  const data = await ZarrDataManager.getVariableDataFromArray(arr, selection);
  return data.data as unknown as TNum;
}

async function analyseMap(arr: TArray, selection: (number | null)[]) {
  const raw = await readMap(arr, selection);
  const s = stats(raw, arr.dtype);
  const decl = declared(arr);
  const declaredFills = ["zarrFillValue", "_FillValue", "missing_value"]
    .map((k) => {
      const d = decl[k] as { value?: number } | number | null | undefined;
      const v = typeof d === "number" ? d : d?.value;
      return v === undefined || v === null ? undefined : [k, Number(v)];
    })
    .filter((x): x is [string, number] => x !== undefined);
  const sentinels = sentinelCandidates(s).map((t) => ({
    ...t,
    matches: declaredFills
      .filter(([, v]) => sameValue(v, t.value))
      .map(([k]) => k),
  }));
  // What gridlook makes of it: its fill/missing logic, then the range the
  // histogram and colour scale start from.
  const f32 = Float32Array.from(castDataVarToFloat32(raw as never));
  const g = decodeVariableDataAndGetBounds(arr, f32);
  let maskedByGridlook = 0;
  for (let i = 0; i < f32.length; i++) {
    if (Number.isNaN(f32[i])) {
      maskedByGridlook++;
    }
  }
  return {
    selection,
    stats: s,
    sentinels,
    gridlook: {
      fillValue: getFillValue(arr),
      missingValue: getMissingValue(arr),
      min: g.min,
      max: g.max,
      maskedFraction: +(maskedByGridlook / f32.length).toFixed(4),
    },
  };
}

async function audit(entry: TEntry, maxMB: number) {
  ZarrDataManager.invalidateCache();
  const p = paramsOf(entry);
  const index = await indexFromZarr(entry.url);
  const vars = index.levels[0].datasources;
  const dataVars = Object.keys(vars).filter((v) => !vars[v].hidden);
  const varname = p.varname ?? index.default_var ?? dataVars[0];
  const gridType = await getGridType(true, varname, index, () => {});
  const out: Record<string, unknown> = { varname, gridType, variables: {} };
  const variables = out.variables as Record<string, unknown>;
  const names = [varname, ...dataVars.filter((v) => v !== varname)];
  for (const name of names) {
    const src = vars[name];
    try {
      const arr = await ZarrDataManager.getVariableInfo(
        { store: src.store, dataset: src.dataset } as never,
        name,
      );
      const spatial = spatialDims(arr, gridType);
      if (arr.shape.length < 2 && gridType !== "healpix") {
        variables[name] = { skipped: "fewer than 2 dimensions" };
        continue;
      }
      const dims = dimNamesOf(arr);
      const base = arr.shape.map((_, i) => (spatial.includes(i) ? null : 0));
      const firstNonSpatial = arr.shape.findIndex(
        (size, i) => !spatial.includes(i) && size > 1,
      );
      const steps =
        name === varname && firstNonSpatial >= 0
          ? [
              ...new Set([
                0,
                Math.floor(arr.shape[firstNonSpatial] / 2),
                arr.shape[firstNonSpatial] - 1,
              ]),
            ]
          : [0];
      const mb = uncompressedMB(arr, base);
      if (mb > maxMB) {
        variables[name] = {
          dtype: arr.dtype,
          declared: declared(arr),
          skipped: `map read is ${mb.toFixed(0)} MB uncompressed`,
        };
        continue;
      }
      const maps = [];
      for (const step of steps) {
        const sel = [...base];
        if (firstNonSpatial >= 0) {
          sel[firstNonSpatial] = step;
        }
        maps.push(await analyseMap(arr, sel));
      }
      variables[name] = {
        dtype: arr.dtype,
        dims,
        stepDim: firstNonSpatial >= 0 ? dims[firstNonSpatial] : undefined,
        declared: declared(arr),
        maps,
      };
    } catch (e) {
      variables[name] = { error: String(e) };
    }
  }
  return out;
}

function replacer(_k: string, v: unknown) {
  if (typeof v === "bigint") {
    return `${v}n`;
  }
  if (typeof v === "number" && !Number.isFinite(v)) {
    return String(v);
  }
  return v;
}

test("audit values", { timeout: 6 * 3_600_000 }, async () => {
  const { datasets } = JSON.parse(
    readFileSync(process.env.CATALOG!, "utf8"),
  ) as { datasets: TEntry[] };
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : undefined;
  const maxMB = Number(process.env.MAX_MB ?? 600);
  const results = [];
  for (const entry of datasets) {
    if (only && !only.test(entry.title)) {
      continue;
    }
    let r: Record<string, unknown>;
    try {
      r = {
        title: entry.title,
        url: entry.url,
        ...(await audit(entry, maxMB)),
      };
    } catch (e) {
      r = { title: entry.title, url: entry.url, error: String(e) };
    }
    results.push(r);
    writeFileSync(process.env.OUT!, JSON.stringify(results, replacer, 1));
  }
});
