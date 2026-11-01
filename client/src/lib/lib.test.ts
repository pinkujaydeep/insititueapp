import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { isMoneyInput, splitEvenly, subtractMoney, sumMoney, toMoneyInput, toPaise } from "./money";
import { ilikeAny, sanitizeSearch } from "./query";
import { emptyRegistration, normalizeMobile, validateRegistration } from "./validation";

describe("normalizeMobile", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+44 7911 123456", "+447911123456"],
    ["0044 7911 123456", "+447911123456"],
  ])("accepts %s", (input, expected) => expect(normalizeMobile(input)).toBe(expected));

  it.each(["12345", "5123456789", "+91 5123456789", "abc", "", "+0 123456789"])("rejects %s", (input) =>
    expect(normalizeMobile(input)).toBeNull());
});

describe("validateRegistration", () => {
  const valid = {
    ...emptyRegistration,
    full_name: "Asha Verma",
    email: "asha@example.com",
    mobile: "9876543210",
    city: "Pune",
    state: "Maharashtra",
    postal_code: "411001",
    highest_qualification: "B.Com",
    course_id: "c1",
    privacy_consent: true,
  };

  it("passes a complete form", () => {
    expect(validateRegistration(valid, { batchRequired: false })).toEqual({});
  });

  it("reports every missing mandatory field", () => {
    const errors = validateRegistration(emptyRegistration, { batchRequired: true });
    expect(Object.keys(errors).sort()).toEqual(
      ["batch_id", "city", "course_id", "email", "full_name", "highest_qualification", "mobile", "postal_code", "privacy_consent", "state"].sort(),
    );
  });

  it("rejects invalid email, Indian PIN and duplicate alternate mobile", () => {
    const errors = validateRegistration(
      { ...valid, email: "a@b", postal_code: "12345", alt_mobile: "+91 98765 43210" },
      { batchRequired: false },
    );
    expect(errors.email).toBeDefined();
    expect(errors.postal_code).toMatch(/6-digit/);
    expect(errors.alt_mobile).toMatch(/different/);
  });

  it("rejects script markup in names and implausible dates of birth", () => {
    const errors = validateRegistration({ ...valid, full_name: "<script>", date_of_birth: "2025-01-01" }, { batchRequired: false, today: new Date("2026-11-01") });
    expect(errors.full_name).toBeDefined();
    expect(errors.date_of_birth).toBeDefined();
  });
});

describe("money", () => {
  it("validates amount input with at most two decimals", () => {
    expect(isMoneyInput("1500")).toBe(true);
    expect(isMoneyInput("1500.5")).toBe(true);
    expect(isMoneyInput("1500.55")).toBe(true);
    expect(isMoneyInput("1500.555")).toBe(false);
    expect(isMoneyInput("-5")).toBe(false);
    expect(isMoneyInput("1e3")).toBe(false);
  });

  it("adds without floating point drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(["3333.33", "3333.33", "3333.34"])).toBe(10000);
    expect(subtractMoney("10000", "3333.33")).toBe(6666.67);
    expect(toPaise("12.5")).toBe(1250);
    expect(toPaise(-5.5)).toBe(-550);
  });

  it("splits like the database (last part absorbs rounding)", () => {
    expect(splitEvenly(10000, 3)).toEqual([3333.33, 3333.33, 3333.34]);
    expect(sumMoney(splitEvenly("999.99", 7))).toBe(999.99);
    expect(splitEvenly(0, 3)).toEqual([]);
  });

  it("formats values for inputs", () => {
    expect(toMoneyInput(1500)).toBe("1500.00");
    expect(toMoneyInput("12.5")).toBe("12.50");
  });
});

describe("csv export", () => {
  it("adds a UTF-8 BOM for Excel and quotes values", () => {
    const csv = toCsv(["Name", "Amount"], [["Ravi, Kumar", 100], ['Quote "x"', null]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Ravi, Kumar","100"');
    expect(csv).toContain('"Quote ""x""",""');
  });

  it("neutralises spreadsheet formula injection", () => {
    const csv = toCsv(["A"], [["=HYPERLINK(\"http://evil\")"], ["+91 98765"], ["@SUM(A1)"]]);
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain(`"'+91 98765"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
  });
});

describe("search filter sanitising", () => {
  it("removes PostgREST filter syntax characters", () => {
    expect(sanitizeSearch("ravi),status.eq.paid,(x")).toBe("ravi status.eq.paid x");
    expect(ilikeAny("  ", ["a"])).toBeNull();
    expect(ilikeAny("ravi", ["full_name", "email"])).toBe("full_name.ilike.*ravi*,email.ilike.*ravi*");
  });
});
