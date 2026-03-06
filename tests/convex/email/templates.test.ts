import { describe, it, expect } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { createTest, createTestUser, createAdminUser } from "../helpers";

const TEMPLATE_ARGS = {
  name: "test-template",
  label: "Test Template",
  subject: "Hello {{name}}",
  editorMode: "visual" as const,
  contentJson: JSON.stringify({ type: "doc", content: [] }),
  variables: [{ name: "name", required: true }],
};

describe("Email Templates", () => {
  it("admin can create a template and list it", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    const templateId = await asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS);
    expect(templateId).toBeTruthy();

    const templates = await asAdmin.query(api.email.templates.list, {});
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("test-template");
    expect(templates[0].label).toBe("Test Template");
  });

  it("non-admin cannot create a template", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    await expect(
      asUser.mutation(api.email.templates.create, TEMPLATE_ARGS)
    ).rejects.toThrow(/[Aa]dmin/);
  });

  it("duplicate template name is rejected", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    await asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS);

    await expect(
      asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS)
    ).rejects.toThrow(/already exists/);
  });

  it("update a template", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    const templateId = await asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS);

    await asAdmin.mutation(api.email.templates.update, {
      templateId,
      label: "Updated Label",
      subject: "New Subject",
    });

    const template = await asAdmin.query(api.email.templates.get, { templateId });
    expect(template).not.toBeNull();
    expect(template!.label).toBe("Updated Label");
    expect(template!.subject).toBe("New Subject");
    // Unchanged fields preserved
    expect(template!.name).toBe("test-template");
    expect(template!.editorMode).toBe("visual");
  });

  it("duplicate a template", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    const templateId = await asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS);

    const copyId = await asAdmin.mutation(api.email.templates.duplicate, {
      templateId,
    });

    const copy = await asAdmin.query(api.email.templates.get, { templateId: copyId });
    expect(copy).not.toBeNull();
    expect(copy!.name).toBe("test-template-copy");
    expect(copy!.label).toBe("Test Template (Copy)");
  });

  it("delete a template", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    const templateId = await asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS);

    await asAdmin.mutation(api.email.templates.remove, { templateId });

    const templates = await asAdmin.query(api.email.templates.list, {});
    expect(templates).toHaveLength(0);
  });

  it("cannot delete template with queued emails", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    const templateId = await asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS);

    // Insert a queued email log referencing this template directly to avoid scheduler
    await t.run(async (ctx) => {
      await ctx.db.insert("emailLogs", {
        to: "user@example.com",
        subject: "",
        template: "custom",
        templateData: JSON.stringify({}),
        status: "queued",
        customTemplateId: templateId,
        createdAt: Date.now(),
      });
    });

    await expect(
      asAdmin.mutation(api.email.templates.remove, { templateId })
    ).rejects.toThrow(/queued emails/i);
  });

  it("getInternal returns template for actions", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);

    const templateId = await asAdmin.mutation(api.email.templates.create, TEMPLATE_ARGS);

    const template = await t.query(internal.email.templates.getInternal, { templateId });
    expect(template).not.toBeNull();
    expect(template!.name).toBe("test-template");
    expect(template!.subject).toBe("Hello {{name}}");
  });
});
