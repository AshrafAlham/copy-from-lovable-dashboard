import Papa from "papaparse";

export type Row = {
  __timestamp: Date | null;
  __readingDate?: Date | null;
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

// Reading dates are Google Forms M/D/YYYY values, not submission timestamps.
// Include the recorded shift time so the two daily readings stay distinct.
export function parseReadingDate(date: string, time = ""): Date | null {
  const value = date.trim();
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!us && !iso) return null;
  const year = Number(us ? us[3] : iso?.[1]);
  const month = Number(us ? us[1] : iso?.[2]);
  const day = Number(us ? us[2] : iso?.[3]);
  const clock = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  let hour = clock ? Number(clock[1]) : 0;
  const minute = clock ? Number(clock[2]) : 0;
  const second = clock ? Number(clock[3] ?? 0) : 0;
  const period = clock?.[4]?.toUpperCase();
  if (period) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (period === "PM" ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  const result = new Date(year, month - 1, day, hour, minute, second);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day
    ? result : null;
}

export function readingDate(row: Row): Date | null {
  return row.__readingDate ?? null;
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
  const tsCol = columns.includes("Timestamp") ? "Timestamp" : columns[0];
  const dateCol = columns.find((c) => c.trim() === "التاريخ");
  const timeCol = columns.find((c) => c.trim() === "الوقت");
  const rows: Row[] = parsed.data.map((r) => {
    const out: Row = {
      __timestamp: parseTimestamp(r[tsCol] ?? ""),
      __readingDate: parseReadingDate(dateCol ? r[dateCol] ?? "" : "", timeCol ? r[timeCol] ?? "" : ""),
    };
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
