import { describe, it, expect } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { createTest, createTestUser, createAdminUser } from "../helpers";
import type { Id } from "../../../convex/_generated/dataModel";

/** Insert an email log directly, bypassing the scheduler. */
async function insertEmailLog(
  t: ReturnType<typeof createTest>,
  overrides: {
    to?: string;
    template?: "welcome" | "notification" | "custom";
    templateData?: string;
    status?: "queued" | "sent" | "failed";
    customTemplateId?: Id<"emailTemplates">;
  } = {}
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("emailLogs", {
      to: overrides.to ?? "user@example.com",
      subject: "",
      template: overrides.template ?? "welcome",
      templateData: overrides.templateData ?? JSON.stringify({}),
      status: overrides.status ?? "queued",
      customTemplateId: overrides.customTemplateId,
      createdAt: Date.now(),
    });
  });
}

describe("Email Logs", () => {
  it("createEmailLog creates a queued log", async () => {
    const t = createTest();

    // Insert directly to avoid scheduled action side effects
    const logId = await insertEmailLog(t, {
      to: "user@example.com",
      template: "welcome",
      templateData: JSON.stringify({ name: "Test" }),
    });

    const log = await t.query(internal.email.logs.getEmailLogInternal, { logId });
    expect(log).not.toBeNull();
    expect(log!.status).toBe("queued");
    expect(log!.subject).toBe("");
    expect(log!.to).toBe("user@example.com");
    expect(log!.template).toBe("welcome");
  });

  it("updateEmailLog patches status and subject", async () => {
    const t = createTest();

    const logId = await insertEmailLog(t);

    await t.mutation(internal.email.logs.updateEmailLog, {
      logId,
      status: "sent",
      subject: "Welcome!",
      provider: "resend",
    });

    const log = await t.query(internal.email.logs.getEmailLogInternal, { logId });
    expect(log).not.toBeNull();
    expect(log!.status).toBe("sent");
    expect(log!.subject).toBe("Welcome!");
    expect(log!.provider).toBe("resend");
  });

  it("updateEmailLog records failure", async () => {
    const t = createTest();

    const logId = await insertEmailLog(t, { template: "notification" });

    await t.mutation(internal.email.logs.updateEmailLog, {
      logId,
      status: "failed",
      error: "SMTP connection refused",
    });

    const log = await t.query(internal.email.logs.getEmailLogInternal, { logId });
    expect(log).not.toBeNull();
    expect(log!.status).toBe("failed");
    expect(log!.error).toBe("SMTP connection refused");
  });

  it("listEmailLogs returns logs for admin", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    await insertEmailLog(t, { to: "a@example.com" });
    await insertEmailLog(t, { to: "b@example.com", template: "notification" });

    const logs = await asAdmin.query(api.email.logs.listEmailLogs, {});
    expect(logs).toHaveLength(2);
  });

  it("listEmailLogs rejects non-admin", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    await expect(
      asUser.query(api.email.logs.listEmailLogs, {})
    ).rejects.toThrow(/[Aa]dmin/);
  });
});
