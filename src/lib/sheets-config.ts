// Paste the "Publish to web → CSV" URL for each train here.
// (File → Share → Publish to web → choose the sheet → CSV)
export const TRAIN_SHEETS: Record<string, string> = {
  "Train A":
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRtWCxqejnal-jlTYPG4-7ouZ2fMzAa2oADMIZGguvHwzfemj1eyfIclDpc-CY6w9luAaNvezzpeoc7/pub?output=csv",
  "Train B": "",
  "Train C": "",
  "Train D": "",
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
]);

// Section groupings — first matching rule wins. Order matters.
export const SECTIONS: { name: string; match: (col: string) => boolean }[] = [
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
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length));
}
