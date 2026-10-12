# Architecture rules

- Preserve submission timestamps separately from parsed reading dates; charts and date-range controls use the shared reading-date accessor so all chart variants agree without changing raw submission records.

- Single-train Pages and charts share one CSS-constrained workspace height above Raw Readings; use internal scrolling instead of independent viewport measurements so their bottom edges stay aligned.