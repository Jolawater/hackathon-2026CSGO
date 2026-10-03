export const fmt = (n, d = 0) =>
  Number(n || 0).toLocaleString("en-HK", { maximumFractionDigits: d });
export const money = (n) => `HK$ ${fmt(n)}`;
