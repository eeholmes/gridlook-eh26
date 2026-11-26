/**
 * Metadata checks for every catalog entry: whether the root metadata is strict
 * JSON (what a browser's `JSON.parse` accepts), whether it is consolidated,
 * the group attributes clients use (licence, conventions, multiscales), and
 * the coordinate arrays: their order, direction and range.
 *
 * Runs the same way as `probe-catalog.test.ts` (see its header), with this file
 * copied into the gridlook checkout's `tests/`, and the same CATALOG, OUT and
 * ONLY variables.
 *
 * The raw fetches of `zarr.json` and `.zmetadata` only record what came back;
 * whether a store opens is decided by gridlook's reader, through `indexFromZarr`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import * as zarr from "zarrita";

import "@/lib/data/codecs";
import { indexFromZarr } from "@/lib/data/sourceIndexing";
import { ZarrDataManager } from "@/lib/data/ZarrDataManager";

type TEntry = {
  title: string;
  url: string;
  params?: string | Record<string, string>;
};
type TArray = zarr.Array<zarr.DataType, zarr.AsyncReadable>;

const GROUP_ATTRS = [
  "license",
  "licence",
  "Conventions",
  "title",
  "institution",
  "source",
  "references",
  "multiscales",
  "geospatial_lat_min",
  "geospatial_lat_max",
  "geospatial_lon_min",
  "geospatial_lon_max",
];

const COORD =
  /^(lat|latitude|lon|longitude|x|y|nav_lat|nav_lon|depth|lev|level|z|time)$/i;

function varnameOf(entry: TEntry): string | undefined {
  const p = entry.params;
  if (typeof p === "string") {
    return /(?:^|::)varname=([^:]+)/.exec(p)?.[1];
  }
  return p?.varname;
}

// Where strict JSON parsing fails, and the text around it.
function strictJson(text: string) {
  try {
    return { ok: true, value: JSON.parse(text) as Record<string, unknown> };
  } catch (e) {
    const m = /position (\d+)/.exec(String(e));
    const at = m ? Number(m[1]) : -1;
    return {
      ok: false,
      error: String(e),
      context: at >= 0 ? text.slice(Math.max(0, at - 40), at + 20) : undefined,
      bareNaN: /:\s*-?(NaN|Infinity)\b/.test(text),
    };
  }
}

async function rawMeta(url: string, file: string) {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/${file}`);
    if (!res.ok) {
      return { status: res.status };
    }
    const text = await res.text();
    const parsed = strictJson(text);
    return { status: res.status, bytes: text.length, ...parsed };
  } catch (e) {
    return { error: String(e) };
  }
}

function numbers(data: ArrayLike<number | bigint>) {
  return Array.from(data as ArrayLike<number>, Number);
}

async function coordSummary(arr: TArray) {
  const n = arr.shape.reduce((a, b) => a * b, 1);
  if (n > 50_000_000) {
    return { skipped: `${n} elements` };
  }
  const data = numbers(
    (await ZarrDataManager.getVariableDataFromArray(arr)).data as never,
  );
  let min = Infinity;
  let max = -Infinity;
  let nan = 0;
  for (const v of data) {
    if (Number.isNaN(v)) {
      nan++;
    } else {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  const out: Record<string, unknown> = {
    min,
    max,
    nan,
    first: data[0],
    last: data[data.length - 1],
  };
  if (arr.shape.length === 1 && data.length > 1) {
    let up = 0;
    let down = 0;
    let steps = new Set<string>();
    for (let i = 1; i < data.length; i++) {
      const d = data[i] - data[i - 1];
      if (d > 0) up++;
      if (d < 0) down++;
      if (steps.size < 20) steps.add(d.toPrecision(6));
    }
    out.order =
      up && down
        ? "non-monotonic"
        : up
          ? "ascending"
          : down
            ? "descending"
            : "constant";
    out.distinctSteps = steps.size >= 20 ? "20+" : [...steps];
  }
  return out;
}

async function audit(entry: TEntry) {
  const out: Record<string, unknown> = {};
  out.zarrJson = await rawMeta(entry.url, "zarr.json");
  out.zmetadata = await rawMeta(entry.url, ".zmetadata");
  const zj = out.zarrJson as { value?: Record<string, unknown> };
  if (zj.value) {
    const v = zj.value;
    const cm = v.consolidated_metadata as
      { metadata?: Record<string, unknown> } | undefined;
    out.rootV3 = {
      zarr_format: v.zarr_format,
      node_type: v.node_type,
      consolidated: Boolean(cm?.metadata),
      consolidatedNodes: cm?.metadata ? Object.keys(cm.metadata).length : 0,
    };
    const attrs = (v.attributes ?? {}) as Record<string, unknown>;
    out.groupAttrs = Object.fromEntries(
      GROUP_ATTRS.filter((k) => Object.hasOwn(attrs, k)).map((k) => [
        k,
        k === "multiscales" ? JSON.stringify(attrs[k]).slice(0, 400) : attrs[k],
      ]),
    );
    out.groupAttrKeys = Object.keys(attrs).length;
  }
  const zm = out.zmetadata as { value?: Record<string, unknown> };
  if (zm.value) {
    const md = (zm.value.metadata ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const attrs = (md[".zattrs"] ?? {}) as Record<string, unknown>;
    out.groupAttrs = {
      ...(out.groupAttrs as object),
      ...Object.fromEntries(
        GROUP_ATTRS.filter((k) => Object.hasOwn(attrs, k)).map((k) => [
          k,
          attrs[k],
        ]),
      ),
    };
  }
  // Keep the parsed documents out of the report; they can be large.
  delete (out.zarrJson as Record<string, unknown>).value;
  delete (out.zmetadata as Record<string, unknown>).value;

  ZarrDataManager.invalidateCache();
  let index: Awaited<ReturnType<typeof indexFromZarr>>;
  try {
    index = await indexFromZarr(entry.url);
  } catch (e) {
    // Keep the raw-metadata findings for stores gridlook cannot open.
    out.indexError = String(e);
    return out;
  }
  const vars = index.levels[0].datasources;
  const valid = Object.keys(vars).filter((v) => !vars[v].hidden);
  const varname = varnameOf(entry) ?? index.default_var ?? valid[0];
  const groups = new Set(
    Object.keys(vars)
      .filter((k) => k.includes("/"))
      .map((k) => k.split("/").slice(0, -1).join("/")),
  );
  out.groups = [...groups];
  out.varname = varname;

  const src = vars[varname];
  const arr = await ZarrDataManager.getVariableInfo(
    { store: src.store, dataset: src.dataset } as never,
    varname,
  );
  const dims =
    arr.dimensionNames ??
    (arr.attrs._ARRAY_DIMENSIONS as string[] | undefined) ??
    [];
  out.variable = {
    dims,
    shape: arr.shape,
    units: arr.attrs.units,
    standard_name: arr.attrs.standard_name,
    long_name: arr.attrs.long_name,
    coordinates: arr.attrs.coordinates,
    grid_mapping: arr.attrs.grid_mapping,
  };

  // Coordinate arrays in the same group as the variable.
  const prefix = varname.includes("/")
    ? varname.split("/").slice(0, -1).join("/") + "/"
    : "";
  const coords: Record<string, unknown> = {};
  for (const name of Object.keys(vars)) {
    if (!name.startsWith(prefix) || name.slice(prefix.length).includes("/")) {
      continue;
    }
    const short = name.slice(prefix.length);
    if (!COORD.test(short) && !dims.includes(short)) {
      continue;
    }
    try {
      const c = await ZarrDataManager.getVariableInfo(
        { store: vars[name].store, dataset: vars[name].dataset } as never,
        name,
      );
      coords[short] = {
        dtype: c.dtype,
        shape: c.shape,
        dims: c.dimensionNames ?? c.attrs._ARRAY_DIMENSIONS,
        units: c.attrs.units,
        axis: c.attrs.axis,
        standard_name: c.attrs.standard_name,
        calendar: c.attrs.calendar,
        ...(await coordSummary(c)),
      };
    } catch (e) {
      coords[short] = { error: String(e) };
    }
  }
  // Dimensions with no coordinate array at all.
  out.dimsWithoutCoord = dims.filter((d) => !Object.hasOwn(coords, d));
  out.coords = coords;
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

test("audit metadata", { timeout: 3 * 3_600_000 }, async () => {
  const { datasets } = JSON.parse(
    readFileSync(process.env.CATALOG!, "utf8"),
  ) as { datasets: TEntry[] };
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : undefined;
  const results = [];
  for (const entry of datasets) {
    if (only && !only.test(entry.title)) {
      continue;
    }
    let r: Record<string, unknown>;
    try {
      r = { title: entry.title, url: entry.url, ...(await audit(entry)) };
    } catch (e) {
      r = { title: entry.title, url: entry.url, error: String(e) };
    }
    results.push(r);
    writeFileSync(process.env.OUT!, JSON.stringify(results, replacer, 1));
  }
});
