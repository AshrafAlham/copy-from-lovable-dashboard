// Paste the "Publish to web → CSV" URL for each train here.
// (File → Share → Publish to web → choose the sheet → CSV)
export const TRAIN_SHEETS: Record<string, string> = {
  "Train A":
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRtWCxqejnal-jlTYPG4-7ouZ2fMzAa2oADMIZGguvHwzfemj1eyfIclDpc-CY6w9luAaNvezzpeoc7/pub?output=csv",
  "Train B": "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2o8F8wrVQHjVSY1AqWZWDMpooS82KkxQNkkcI6a4R_VgzLWt8hC8vE-OSCfwm3slufGjlIh-ENLB1/pub?output=csv",
  "Train C": "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPxqWaOC6P-OxdIb7UE3_9jXTKzlJQlvyLZbbqfMO_MmdCfyQ7AhUGR8XCVDYPaKDzoJ-LwCozXAbO/pub?output=csv",
  "Train D": "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-FWIH-J19DvqkbnBuiDRRsbQHjkXzF_JdCWw9RG5EkCUqC0E9mZYo8AhHAgDaYAPJuTf5oBgRq_ih/pub?output=csv",
};

// Site Conditions sheet: contains general plant data + per-train sensors.
// Per-train sensors are identified by the digit immediately after the dash
// inside their tag, e.g. (PDI-1314) → Train A, (PIT-2226A) → Train B, etc.
export const SITE_CONDITIONS_SHEET =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRlQGwma1X4tuXc7TOO5aev3tp9xx_8jp59aJY_eri6zPM3lXsD-xPnjbC2BSqDYIu3H750igxTJq-q/pub?output=csv";

// Map a Train name ↔ the digit used in its Site Conditions tags.
export const TRAIN_TAG_DIGIT: Record<string, "1" | "2" | "3" | "4"> = {
  "Train A": "1",
  "Train B": "2",
  "Train C": "3",
  "Train D": "4",
};

// Columns that are metadata (not numeric sensor readings).
export const META_COLUMNS = new Set([
  "Timestamp",
  "التاريخ",
  "الوقت",
  "الاسم ",
  "الاسم",
  "Column 1",
  "Shift Engineer",
  "Train in service",
  "Train Mode",
  "Trian Mode",
]);

// Section groupings — first matching rule wins. Order matters.
export const SECTIONS: { name: string; match: (col: string) => boolean }[] = [
  { name: "Seal Gas", match: (c) => /(seal gas|seal-process|primary vent|buffer air|gas comp\. suction)/i.test(c) },
  { name: "Fuel Gas", match: (c) => /(fuel gas|inlet [pt] \(|after reduction|intermediate stage)/i.test(c) },
  { name: "Utilities", match: (c) => /(water|instrument p|utility p|compressor [abc] discharge t|dryer|diesel|flare|filter in service)/i.test(c) },
  { name: "Lube Oil", match: (c) => /oil/i.test(c) },
  { name: "Axial Compressor (Air)", match: (c) => /(axial compressor|air |air press|air temp|filters|cooling air|plenum|compartment)/i.test(c) },
  { name: "Turbine Bearings — Temperature", match: (c) => /turbine.*bearing.*temp/i.test(c) },
  { name: "Turbine Bearings — Vibration", match: (c) => /turbine.*bearing.*vibration/i.test(c) },
  { name: "Compressor Bearings — Temperature", match: (c) => /compressor.*bearing.*temp/i.test(c) },
  { name: "Compressor Bearings — Vibration", match: (c) => /compressor.*bearing.*vibration/i.test(c) },
  { name: "Gearbox Bearings — Temperature", match: (c) => /gearbox.*bearing.*temp/i.test(c) },
  { name: "Gearbox Bearings — Vibration", match: (c) => /gearbox.*bearing.*vibration/i.test(c) },
  { name: "Wheelspace", match: (c) => /wheelspace/i.test(c) },
  { name: "Exhaust", match: (c) => /(exhaust|spread)/i.test(c) },
  { name: "Control", match: (c) => /(srv|gcv|igv|fsr|nozzle)/i.test(c) },
  { name: "Other", match: () => true },
];

export function groupColumns(columns: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const sec of SECTIONS) out[sec.name] = [];
  for (const col of columns) {
    if (META_COLUMNS.has(col) || META_COLUMNS.has(col.trim())) continue;
    const sec = SECTIONS.find((s) => s.match(col))!;
    out[sec.name].push(col);
  }
  delete out["Other"];
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length));
}

// --- Site Conditions classification ----------------------------------------

// Try to extract the train digit from a Site Conditions column header
// using the instrument tag, e.g. "(PDI-1314) ..." or "(PIT-2226A) ..." —
// digit right after "-". Named columns without a tag are treated as general.
export function siteColumnTrainDigit(col: string): "1" | "2" | "3" | "4" | null {
  const tag = col.match(/\([A-Za-z]+-([1-4])\d/);
  if (tag) return tag[1] as "1" | "2" | "3" | "4";
  // Untagged per-train columns named by letter, e.g. "Comp B ...", "Gearbox C".
  const letter = col.match(/\b(?:comp|gearbox|turbine)\s+([A-D])\b/i);
  if (letter) return String(" ABCD".indexOf(letter[1].toUpperCase())) as "1" | "2" | "3" | "4";
  return null;
}

export interface SplitSiteColumns {
  general: string[];
  byTrain: Record<string, string[]>; // train name → columns
}

export function splitSiteColumns(columns: string[]): SplitSiteColumns {
  const byTrain: Record<string, string[]> = {
    "Train A": [],
    "Train B": [],
    "Train C": [],
    "Train D": [],
  };
  const general: string[] = [];
  const digitToTrain: Record<string, string> = {
    "1": "Train A",
    "2": "Train B",
    "3": "Train C",
    "4": "Train D",
  };
  let lastDigit: "1" | "2" | "3" | "4" | null = null;
  for (const col of columns) {
    if (!col) continue;
    if (META_COLUMNS.has(col) || META_COLUMNS.has(col.trim())) continue;
    // Skip the timestamp/first-column header (often a stray date string).
    if (col === "Timestamp" || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(col.trim())) continue;
    if (/^(train in service|train mode|trian mode|unnamed|_\d)/i.test(col.trim())) continue;
    let digit = siteColumnTrainDigit(col);
    // Typo tags like "(PI-x310)" sit inside a train block → inherit that train.
    if (!digit && /\([A-Za-z]+-x\d/i.test(col)) digit = lastDigit;
    if (digit) lastDigit = digit;
    if (digit) byTrain[digitToTrain[digit]].push(col);
    else general.push(col);
  }
  return { general, byTrain };
}
