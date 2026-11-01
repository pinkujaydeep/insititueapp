// Money helpers. All arithmetic is done in integer paise to avoid floating-point errors;
// authoritative balances are always calculated by the database.

const MONEY_RE = /^\d{1,8}(\.\d{1,2})?$/;

export function isMoneyInput(value: string): boolean {
  return MONEY_RE.test(value.trim());
}

export function toPaise(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const [whole, frac = ""] = String(value).trim().split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const paise = Math.abs(Number(whole)) * 100 + Number((frac + "00").slice(0, 2));
  return sign * paise;
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function sumMoney(values: Array<number | string | null | undefined>): number {
  return fromPaise(values.reduce<number>((acc, v) => acc + toPaise(v), 0));
}

export function subtractMoney(a: number | string, b: number | string): number {
  return fromPaise(toPaise(a) - toPaise(b));
}

/** Splits a total into `count` parts; the last part absorbs rounding (same rule as the database). */
export function splitEvenly(total: number | string, count: number): number[] {
  const t = toPaise(total);
  if (count < 1 || t <= 0) return [];
  const each = Math.floor(t / count);
  return Array.from({ length: count }, (_, i) => fromPaise(i === count - 1 ? t - each * (count - 1) : each));
}

/** Formats a decimal string for an <input>, e.g. 1500 -> "1500.00". */
export function toMoneyInput(value: number | string | null | undefined): string {
  const p = toPaise(value);
  return `${Math.trunc(p / 100)}.${String(Math.abs(p % 100)).padStart(2, "0")}`;
}
