import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { createTest, createTestUser, createAdminUser } from "../helpers";

describe("email send flow", () => {
  // Use fake timers so ctx.scheduler.runAfter(0, ...) never fires the
  // processEmail action (which requires Node.js / external APIs).
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sendEmail creates a queued log for authenticated user", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    const logId = await asUser.mutation(api.email.send.sendEmail, {
      to: "recipient@test.com",
      template: "welcome",
      templateData: JSON.stringify({ name: "Recipient", loginUrl: "/dashboard" }),
    });

    expect(logId).toBeTruthy();

    const log = await t.query(internal.email.logs.getEmailLogInternal, { logId });
    expect(log).not.toBeNull();
    expect(log!.to).toBe("recipient@test.com");
    expect(log!.template).toBe("welcome");
    expect(log!.status).toBe("queued");
    expect(log!.subject).toBe("");
    expect(log!.sentBy).toBeTruthy();
  });

  it("sendEmail with custom template stores customTemplateId", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    const templateId = await asAdmin.mutation(api.email.templates.create, {
      name: "newsletter",
      label: "Newsletter",
      subject: "News for {{name}}",
      editorMode: "html" as const,
      contentJson: "{}",
      contentHtml: "<p>Hello {{name}}</p>",
      variables: [{ name: "name", required: true }],
    });

    const logId = await asAdmin.mutation(api.email.send.sendEmail, {
      to: "subscriber@test.com",
      template: "custom",
      templateData: JSON.stringify({ name: "Subscriber" }),
      customTemplateId: templateId,
    });

    const log = await t.query(internal.email.logs.getEmailLogInternal, { logId });
    expect(log).not.toBeNull();
    expect(log!.template).toBe("custom");
    expect(log!.customTemplateId).toBe(templateId);
  });

  it("resendEmail creates a new log from old one (admin only)", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    // Insert a failed log directly to avoid scheduler side effects
    const originalLogId = await t.run(async (ctx) => {
      return await ctx.db.insert("emailLogs", {
        to: "failed@test.com",
        subject: "Original Subject",
        template: "notification",
        templateData: JSON.stringify({ name: "User", title: "Alert", body: "Something happened" }),
        status: "failed",
        error: "SMTP timeout",
        createdAt: Date.now(),
      });
    });

    const newLogId = await asAdmin.mutation(api.email.send.resendEmail, { logId: originalLogId });
    expect(newLogId).not.toBe(originalLogId);

    const newLog = await t.query(internal.email.logs.getEmailLogInternal, { logId: newLogId });
    expect(newLog).not.toBeNull();
    expect(newLog!.to).toBe("failed@test.com");
    expect(newLog!.template).toBe("notification");
    expect(newLog!.status).toBe("queued");
    // Subject is reset to empty for re-processing
    expect(newLog!.subject).toBe("");
  });

  it("resendEmail rejects non-admin", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    const logId = await t.run(async (ctx) => {
      return await ctx.db.insert("emailLogs", {
        to: "test@test.com",
        subject: "",
        template: "welcome",
        templateData: "{}",
        status: "failed",
        createdAt: Date.now(),
      });
    });

    await expect(
      asUser.mutation(api.email.send.resendEmail, { logId })
    ).rejects.toThrow(/[Aa]dmin/);
  });
});
