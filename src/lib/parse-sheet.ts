import Papa from "papaparse";

export type Row = {
  __timestamp: Date | null;
  [key: string]: string | number | Date | null;
};

export interface SheetData {
  columns: string[];
  rows: Row[];
}

function parseTimestamp(ts: string): Date | null {
  if (!ts) return null;
  // Format from Google Forms: "6/21/2025 18:51:15"
  const d = new Date(ts);
  if (!isNaN(d.getTime())) return d;
  return null;
}

export async function fetchSheet(url: string): Promise<SheetData> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const columns = parsed.meta.fields ?? [];
  const rows: Row[] = parsed.data.map((r) => {
    const out: Row = { __timestamp: parseTimestamp(r["Timestamp"] ?? "") };
    for (const col of columns) {
      const raw = r[col];
      if (raw === undefined || raw === "") {
        out[col] = null;
        continue;
      }
      const num = Number(raw);
      out[col] = Number.isFinite(num) && raw.trim() !== "" ? num : raw;
    }
    return out;
  });
  // Sort ascending by timestamp
  rows.sort((a, b) => (a.__timestamp?.getTime() ?? 0) - (b.__timestamp?.getTime() ?? 0));
  return { columns, rows };
}
