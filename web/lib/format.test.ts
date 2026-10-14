import { describe, expect, it } from "vitest";
import { formatBudget, formatDuration, formatNativeWei, formatTokenFloor, formatUsdc6, groupAmountInput, isValidAmountInput, parseNativeWei, parseUsdc6 } from "./format";

describe("money formatting", () => {
  it("formats 6-decimal USDC", () => {
    expect(formatUsdc6(7_500_000_000n)).toBe("$7,500.00");
    expect(formatUsdc6(1n)).toBe("$0.00");
    expect(formatUsdc6(5_000n)).toBe("$0.01");
    expect(formatUsdc6(123_456_789_012_345n)).toBe("$123,456,789.01");
  });
  it("formats native 18-decimal USDC on the same single USDC line", () => {
    expect(formatNativeWei(10n ** 18n)).toBe("$1.00");
    expect(formatNativeWei(25n * 10n ** 17n)).toBe("$2.50");
  });
  it("formats budgets", () => {
    expect(formatBudget(5_000_000_000n, 10_000_000_000n)).toBe("$5,000.00–$10,000.00");
  });
  it("parses user input with explicit decimals", () => {
    expect(parseUsdc6("7,500")).toBe(7_500_000_000n);
    expect(parseUsdc6("$0.000001")).toBe(1n);
    expect(parseNativeWei("1.5")).toBe(15n * 10n ** 17n);
    expect(() => parseUsdc6("abc")).toThrow();
    expect(isValidAmountInput("1.1234567")).toBe(false);
    expect(isValidAmountInput("1.123456")).toBe(true);
  });
  it("formats durations", () => {
    expect(formatDuration(90061)).toBe("1d 1h 1m");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("wallet balance display", () => {
  it("rounds down to the cent, never up", async () => {
    const { formatNativeWeiFloor } = await import("./format");
    expect(formatNativeWeiFloor(44_929_233_183_968_204_793n)).toBe("$44.92");
    expect(formatNativeWeiFloor(999_999_999_999_999_999n)).toBe("$0.99");
    expect(formatNativeWeiFloor(1_234_567n * 10n ** 18n)).toBe("$1,234,567.00");
  });
});

describe("token amounts", () => {
  it("floors to the shown precision, never rounding up", () => {
    expect(formatTokenFloor(64_922_704n, 6)).toBe("64.92");
    expect(formatTokenFloor(89_601_608n, 6)).toBe("89.60");
    expect(formatTokenFloor(999_999n, 6)).toBe("0.99");
    expect(formatTokenFloor(1_234_567_000_000n, 6)).toBe("1,234,567.00");
  });
  it("shows BTC-style amounts with up to 8 decimals, trimmed", () => {
    expect(formatTokenFloor(14_991n, 8, 8, 0)).toBe("0.00014991");
    expect(formatTokenFloor(100_000_000n, 8, 8, 0)).toBe("1");
    expect(formatTokenFloor(150_000_000n, 8, 8, 0)).toBe("1.5");
    expect(formatTokenFloor(0n, 8, 8, 0)).toBe("0");
  });
});

describe("amount input grouping", () => {
  it("groups thousands while typing", () => {
    expect(groupAmountInput("10000000", 6)).toBe("10,000,000");
    expect(groupAmountInput("1,0000", 6)).toBe("10,000");
    expect(groupAmountInput("1234.", 6)).toBe("1,234.");
    expect(groupAmountInput("1234.5", 6)).toBe("1,234.5");
    expect(groupAmountInput("", 6)).toBe("");
  });
  it("cleans input and caps decimals", () => {
    expect(groupAmountInput("007", 6)).toBe("7");
    expect(groupAmountInput(".5", 6)).toBe("0.5");
    expect(groupAmountInput("$1 200.1234567", 6)).toBe("1,200.123456");
    expect(groupAmountInput("1.2.3", 6)).toBe("1.23");
    expect(groupAmountInput("abc", 6)).toBe("");
  });
  it("stays parseable", () => {
    expect(parseUsdc6(groupAmountInput("7500000", 6))).toBe(7_500_000_000_000n);
    expect(isValidAmountInput(groupAmountInput("10000.25", 6))).toBe(true);
  });
});
