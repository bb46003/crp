export const CRPCurrency = {
  grzywna: 1536,
  skojec: 64,
  grosz: 32,
  kwartnik: 16,
  cwiercgrosz: 8,
  denar: 2,
  obol: 1,
};

export function moneyToObols(money = {}) {
  return (
    (money.grzywna ?? 0) * CRPCurrency.grzywna +
    (money.skojec ?? 0) * CRPCurrency.skojec +
    (money.grosz ?? 0) * CRPCurrency.grosz +
    (money.kwartnik ?? 0) * CRPCurrency.kwartnik +
    (money.cwiercgrosz ?? 0) * CRPCurrency.cwiercgrosz +
    (money.denar ?? 0) * CRPCurrency.denar +
    (money.obol ?? 0) * CRPCurrency.obol
  );
}

export function obolsToMoney(value = 0) {
  value = Math.max(0, Math.floor(value));

  const money = {
    grzywna: 0,
    skojec: 0,
    grosz: 0,
    kwartnik: 0,
    cwiercgrosz: 0,
    denar: 0,
    obol: 0,
    total: value,
  };

  money.grzywna = Math.floor(value / CRPCurrency.grzywna);
  value %= CRPCurrency.grzywna;

  money.skojec = Math.floor(value / CRPCurrency.skojec);
  value %= CRPCurrency.skojec;

  money.grosz = Math.floor(value / CRPCurrency.grosz);
  value %= CRPCurrency.grosz;

  money.kwartnik = Math.floor(value / CRPCurrency.kwartnik);
  value %= CRPCurrency.kwartnik;

  money.cwiercgrosz = Math.floor(value / CRPCurrency.cwiercgrosz);
  value %= CRPCurrency.cwiercgrosz;

  money.denar = Math.floor(value / CRPCurrency.denar);
  value %= CRPCurrency.denar;

  money.obol = value;

  return money;
}

export function normalizeMoney(money = {}) {
  const normalized = {
    grzywna: Math.max(0, Number(money.grzywna) || 0),
    skojec: Math.max(0, Number(money.skojec) || 0),
    grosz: Math.max(0, Number(money.grosz) || 0),
    kwartnik: Math.max(0, Number(money.kwartnik) || 0),
    cwiercgrosz: Math.max(0, Number(money.cwiercgrosz) || 0),
    denar: Math.max(0, Number(money.denar) || 0),
    obol: Math.max(0, Number(money.obol) || 0),
  };

  normalized.total = moneyToObols(normalized);

  return normalized;
}

export function canAfford(money = {}, cost = {}) {
  const available = moneyToObols(money);
  const required = moneyToObols(cost);

  return available >= required;
}

export function payMoney(money = {}, cost = {}) {
  const available = moneyToObols(money);
  const required = moneyToObols(cost);

  if (available < required) {
    return null;
  }

  const remaining = available - required;

  return obolsToMoney(remaining);
}

export function addMoney(money = {}, added = {}) {
  const currentValue = moneyToObols(money);
  const addedValue = moneyToObols(added);

  const total = currentValue + addedValue;

  return obolsToMoney(total);
}

export function formatMoney(money = {}, options = {}) {
  const { empty = "—", short = true } = options;

  const parts = [];

  const labels = short
    ? {
        grzywna: "grz.",
        skojec: "sk.",
        grosz: "gr.",
        kwartnik: "kw.",
        cwiercgrosz: "ćw.",
        denar: "den.",
        obol: "ob.",
      }
    : {
        grzywna: "grzywien",
        skojec: "skojców",
        grosz: "groszy",
        kwartnik: "kwartników",
        cwiercgrosz: "ćwierćgroszy",
        denar: "denarów",
        obol: "oboli",
      };

  for (const [key, label] of Object.entries(labels)) {
    const value = money[key] ?? 0;

    if (value > 0) {
      parts.push(`${value} ${label}`);
    }
  }

  return parts.length ? parts.join(" ") : empty;
}
