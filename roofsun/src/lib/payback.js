export function elapsedMonths(start, end) {
  if (!start || !end) return null;
  const a = new Date(start + "T00:00:00Z"),
    b = new Date(end + "T00:00:00Z");
  if (!Number.isFinite(+a) || !Number.isFinite(+b) || b < a) return null;
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    b.getUTCMonth() -
    a.getUTCMonth() +
    (b.getUTCDate() > a.getUTCDate() ? 1 : 0)
  );
}

// Sample the monthly account at each installation anniversary. Do not sum
// cumulative balances or interpolate across maintenance/replacement expenses.
export function annualBalances(result, scenario = "A") {
  const flows = result?.cashflow;
  if (!flows?.length) return [];
  const start = new Date(flows[0].date + "T00:00:00Z");
  const rows = [{ year: 0, date: flows[0].date, balance: flows[0][scenario] }];
  for (let year = 1; year <= result.analysis_years; year++) {
    const end = new Date(start);
    end.setUTCFullYear(start.getUTCFullYear() + year);
    end.setUTCDate(end.getUTCDate() - 1);
    const date = end.toISOString().slice(0, 10);
    const last = flows.filter((p) => p.date <= date).at(-1);
    if (last) rows.push({ year, date: last.date, balance: last[scenario] });
  }
  return rows;
}
