import { describe, it, expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTest, createTestUser, createAdminUser } from "./helpers";

describe("Users service", () => {
  it("getCurrentUser returns null when unauthenticated", async () => {
    const t = createTest();
    const result = await t.query(api.users.getCurrentUser, {});
    expect(result).toBeNull();
  });

  it("getCurrentUser returns user when authenticated", async () => {
    const t = createTest();
    const { asUser, name, email } = await createTestUser(t);
    const result = await asUser.query(api.users.getCurrentUser, {});
    expect(result).not.toBeNull();
    expect(result!.name).toBe(name);
    expect(result!.email).toBe(email);
  });

  it("updateProfile updates name", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t, { name: "Original Name" });

    await asUser.mutation(api.users.updateProfile, { name: "Updated Name" });

    const user = await asUser.query(api.users.getCurrentUser, {});
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Updated Name");
  });

  it("getAllUsers lists all users (admin only)", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t, { name: "Admin" });
    await createTestUser(t, { name: "User One" });
    await createTestUser(t, { name: "User Two" });

    const users = await asAdmin.query(api.users.getAllUsers, {});
    expect(users.length).toBe(3);

    const names = users.map((u) => u.name);
    expect(names).toContain("Admin");
    expect(names).toContain("User One");
    expect(names).toContain("User Two");
  });

  it("adminUpdateUser updates another user's name (admin only)", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);
    const { userId: targetId } = await createTestUser(t, {
      name: "Old Name",
    });

    await asAdmin.mutation(api.users.adminUpdateUser, {
      userId: targetId,
      name: "New Name",
    });

    // Verify via getAllUsers
    const users = await asAdmin.query(api.users.getAllUsers, {});
    const target = users.find((u) => u._id === targetId);
    expect(target).toBeDefined();
    expect(target!.name).toBe("New Name");
  });
});
