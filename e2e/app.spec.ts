import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, closeDb, createCourse, createStaff, registeredEnrollment, sql, type Staff } from "../tests/helpers";

test.afterAll(closeDb);

async function login(page: Page, staff: Staff) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function openMenuIfMobile(page: Page) {
  const toggle = page.getByRole("button", { name: "Open menu" });
  if (await toggle.isVisible()) await toggle.click();
}

test.describe("public website", () => {
  test.beforeEach(async () => clearRateLimits());

  test("shows the course catalogue with search and category filter", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Explore our courses" })).toBeVisible();
    const cards = page.locator(".course-card");
    await expect(cards.first()).toBeVisible();
    await page.getByPlaceholder("Search courses").fill("zzzz-no-such-course");
    await expect(page.getByText("No courses match your search")).toBeVisible();
    await page.getByPlaceholder("Search courses").fill("");
    await page.getByRole("button", { name: "Programming", exact: true }).click();
    await expect(cards.first()).toContainText("Programming");
  });

  test("validates the admission form before submitting", async ({ page }) => {
    await page.goto("/#register");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Please correct the highlighted fields.")).toBeVisible();
    await expect(page.getByText("Enter your full name (2-100 letters)")).toBeVisible();
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel("Mobile number").fill("12345");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText(/Enter a valid 10-digit mobile number/)).toBeVisible();
  });

  test("submits an application and shows the registration number", async ({ page }) => {
    const course = await createCourse({ tuition: 7000, installments: 2 });
    await page.goto("/");
    await page.getByPlaceholder("Search courses").fill(course.code);
    await page.locator(".course-card").getByRole("button", { name: "Apply" }).click();
    const form = page.locator(".registration-form");
    await expect(form.getByText("Total course fee")).toBeVisible();
    await expect(form.locator(".fee-total")).toContainText("7,000.00");
    await form.getByLabel("Full name").fill("Priya Sharma");
    await form.getByLabel("Email address").fill(`priya-${Date.now()}@example.com`);
    await form.getByLabel("Mobile number").fill("9876501234");
    await form.getByLabel("City").fill("Mysuru");
    await form.getByLabel("State").fill("Karnataka");
    await form.getByLabel("PIN / Postal code").fill("570001");
    await form.getByLabel("Highest qualification").fill("Graduate");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByRole("heading", { name: "Application received!" })).toBeVisible();
    await expect(page.locator(".reference-number")).toHaveText(/^REG-\d{4}-\d{5}$/);
  });

  test("mobile navigation menu opens and closes", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Contact" }).click();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });
});

test.describe("admin portal", () => {
  let accounts: Staff;
  let admissions: Staff;

  test.beforeAll(async () => {
    accounts = await createStaff(["accounts_staff"]);
    admissions = await createStaff(["admissions_staff"]);
  });

  test("redirects anonymous visitors to the login page", async ({ page }) => {
    await page.goto("/admin/students");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("rejects an invalid password", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(accounts.email);
    await page.getByLabel("Password").fill("wrong-password-9");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
  });

  test("accounts staff records a payment and gets a printable receipt", async ({ page }) => {
    const course = await createCourse({ tuition: 9000, installments: 3 });
    const enrollment = await registeredEnrollment(course.id, "enrolled", { p_full_name: "Ravi Teja" });
    const [{ student_id }] = await sql<{ student_id: string }>("select student_id from public.student_enrollments where id = $1", [enrollment.id]);

    await login(page, accounts);
    await page.goto(`/admin/students/${student_id}`);
    await expect(page.getByRole("heading", { name: "Ravi Teja" })).toBeVisible();
    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Amount")).toHaveValue("3000.00");
    await dialog.getByLabel("Amount").fill("9999");
    await dialog.getByRole("button", { name: /Save payment/ }).click();
    await expect(dialog.getByText(/Cannot exceed/)).toBeVisible();
    await dialog.getByLabel("Amount").fill("3000");
    await dialog.getByRole("button", { name: /Save payment/ }).click();
    await expect(page).toHaveURL(/\/admin\/receipts\//);
    const receipt = page.locator(".receipt");
    await expect(receipt).toContainText(/RCT-\d{4}-\d{5}/);
    await expect(receipt).toContainText("Ravi Teja");
    await expect(receipt.locator(".receipt-amount")).toContainText("3,000.00");
    await expect(receipt).toContainText("6,000.00");
    await expect(page.getByRole("button", { name: /Print/ })).toBeVisible();
  });

  test("admissions staff only sees permitted navigation", async ({ page }) => {
    await login(page, admissions);
    await openMenuIfMobile(page);
    const nav = page.getByRole("complementary", { name: "Admin navigation" });
    await expect(nav.getByRole("link", { name: "Students & Admissions" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Fee Collection" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Users & Roles" })).toHaveCount(0);
    await page.goto("/admin/payments");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("dashboard shows live statistics with date filter and refresh", async ({ page }) => {
    await login(page, accounts);
    await expect(page.getByText("Registered students")).toBeVisible();
    await expect(page.getByText("Fees collected")).toBeVisible();
    await page.getByLabel("Date range preset").selectOption("this_month");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("heading", { name: "Monthly registrations" })).toBeVisible();
  });

  test("students list filters and shows empty state", async ({ page }) => {
    await login(page, accounts);
    await page.goto("/admin/students");
    await page.getByPlaceholder("Name, mobile, email or registration no.").fill("zzzz-nobody-matches");
    await expect(page.getByText("No students match these filters")).toBeVisible();
  });

  test("logout returns to the login page", async ({ page }) => {
    await login(page, accounts);
    await openMenuIfMobile(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
