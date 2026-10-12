import { describe, expect, test } from "bun:test";
import { fetchSheet, parseReadingDate, readingDate } from "./parse-sheet";

describe("chart reading dates", () => {
  test("uses التاريخ instead of Timestamp for chart dates", async () => {
    const csv = "Timestamp,التاريخ,الوقت,Sensor\n10/12/2026 12:46:00,6/21/2025,9:00 PM,70";
    const sheet = await fetchSheet(`data:text/csv,${encodeURIComponent(csv)}`);
    const row = sheet.rows[0];
    const date = readingDate(row);
    expect(date?.getFullYear()).toBe(2025);
    expect(date?.getMonth()).toBe(5);
    expect(date?.getDate()).toBe(21);
    expect(row.__timestamp?.getFullYear()).toBe(2026);
  });

  test("keeps the two daily readings distinct using الوقت", () => {
    const morning = parseReadingDate("6/21/2025", "9:00 AM");
    const evening = parseReadingDate("6/21/2025", "9:00 PM");
    expect(morning?.getHours()).toBe(9);
    expect(evening?.getHours()).toBe(21);
    expect((evening?.getTime() ?? 0) - (morning?.getTime() ?? 0)).toBe(12 * 60 * 60 * 1000);
  });

  test("never substitutes submission Timestamp when التاريخ is missing", () => {
    expect(readingDate({ __timestamp: new Date("2026-10-12") })).toBeNull();
    expect(parseReadingDate("2/30/2025")).toBeNull();
  });
});