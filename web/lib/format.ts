import { parseUnits } from "viem";

/** ERC-20 view of USDC / tender prices & budgets. */
export const USDC_DECIMALS = 6;
/** Native USDC on Arc (gas, msg.value, bid bonds). Same balance as the 6-decimal view. */
export const NATIVE_DECIMALS = 18;

/** Exact bigint formatting (no float rounding): rounds half-up to cents, adds thousands separators. */
function formatUnitsAsUsd(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals - 2);
  const cents = (value + scale / 2n) / scale;
  const dollars = cents / 100n;
  return `$${dollars.toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** `7_500_000_000n` → `$7,500.00` */
export function formatUsdc6(amount6: bigint): string {
  return formatUnitsAsUsd(amount6, USDC_DECIMALS);
}

/** Wallet balances: rounded DOWN to the cent so the UI never shows more than the wallet holds. */
export function formatNativeWeiFloor(valueWei: bigint): string {
  const cents = valueWei / 10n ** BigInt(NATIVE_DECIMALS - 2);
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** native wei → `$1.00` (one USDC line — bonds are shown in the same unit as prices) */
export function formatNativeWei(valueWei: bigint): string {
  return formatUnitsAsUsd(valueWei, NATIVE_DECIMALS);
}

export function formatBudget(min6: bigint, max6: bigint): string {
  return min6 === max6 ? formatUsdc6(min6) : `${formatUsdc6(min6)}–${formatUsdc6(max6)}`;
}

/** User input like "7,500.5" → 6-decimal bigint. Throws on invalid input. */
export function parseUsdc6(input: string): bigint {
  return parseUnits(normalizeAmountInput(input), USDC_DECIMALS);
}

export function parseNativeWei(input: string): bigint {
  return parseUnits(normalizeAmountInput(input), NATIVE_DECIMALS);
}

export function normalizeAmountInput(input: string): string {
  const v = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error("Enter a positive number");
  return v;
}

export function isValidAmountInput(input: string, decimals = USDC_DECIMALS): boolean {
  try {
    const v = normalizeAmountInput(input);
    return (v.split(".")[1]?.length ?? 0) <= decimals;
  } catch {
    return false;
  }
}

export function shortAddress(addr?: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export function shortHash(hash?: string): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "";
}

export function formatDateTime(tsSec: bigint | number): string {
  // English UI: fixed en-US format, but in the viewer's own time zone
  return new Date(Number(tsSec) * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "local time";
  }
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Exact token amount, rounded DOWN (never shows more than the wallet holds), thousands separators,
 * at most `maxFraction` decimals with trailing zeros trimmed to `minFraction`.
 */
export function formatTokenFloor(value: bigint, decimals: number, maxFraction = 2, minFraction = 2): string {
  const frac = Math.min(maxFraction, decimals);
  const scaled = decimals > frac ? value / 10n ** BigInt(decimals - frac) : value * 10n ** BigInt(frac - decimals);
  const whole = scaled / 10n ** BigInt(frac);
  let fraction = frac > 0 ? (scaled % 10n ** BigInt(frac)).toString().padStart(frac, "0") : "";
  while (fraction.length > minFraction && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Live formatting for amount inputs: keeps digits and one dot, caps decimals, strips leading zeros and groups
 * thousands ("10000000" → "10,000,000"). A trailing dot is kept while typing ("1234." → "1,234.").
 * The result still parses with parseUsdc6 / isValidAmountInput (commas are stripped there).
 */
export function groupAmountInput(raw: string, maxDecimals: number): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  let int = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const frac = dot === -1 ? undefined : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, maxDecimals);
  int = int.replace(/^0+(?=\d)/, "");
  if (int === "" && frac !== undefined) int = "0";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined || maxDecimals === 0 ? grouped : `${grouped}.${frac}`;
}
