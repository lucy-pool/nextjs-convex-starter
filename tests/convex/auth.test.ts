import { describe, it, expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTest, createTestUser, createAdminUser } from "./helpers";

describe("Auth guard: unauthenticated rejection", () => {
  it("notes.list rejects unauthenticated call", async () => {
    const t = createTest();
    await expect(t.query(api.notes.list, {})).rejects.toThrow(
      /[Aa]uthentication/
    );
  });

  it("notes.create rejects unauthenticated call", async () => {
    const t = createTest();
    await expect(
      t.mutation(api.notes.create, {
        title: "Test",
        body: "Body",
        isPublic: false,
      })
    ).rejects.toThrow(/[Aa]uthentication/);
  });
});

describe("Auth guard: authenticated user access", () => {
  it("notes.list succeeds for authenticated user", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);
    const result = await asUser.query(api.notes.list, {});
    expect(result).toEqual([]);
  });

  it("notes.create succeeds for authenticated user", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);
    const noteId = await asUser.mutation(api.notes.create, {
      title: "Test Note",
      body: "Hello world",
      isPublic: false,
    });
    expect(noteId).toBeDefined();
    expect(typeof noteId).toBe("string");
  });
});

describe("Auth guard: admin-only rejection", () => {
  it("users.getAllUsers rejects non-admin user", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t, { roles: ["user"] });
    await expect(asUser.query(api.users.getAllUsers, {})).rejects.toThrow(
      /[Aa]dmin/
    );
  });

  it("users.updateUserRoles rejects non-admin user", async () => {
    const t = createTest();
    const { asUser, userId } = await createTestUser(t, { roles: ["user"] });
    await expect(
      asUser.mutation(api.users.updateUserRoles, {
        userId,
        roles: ["admin"],
      })
    ).rejects.toThrow(/[Aa]dmin/);
  });
});

describe("Auth guard: admin access", () => {
  it("users.getAllUsers succeeds for admin", async () => {
    const t = createTest();
    const { asUser } = await createAdminUser(t);
    const result = await asUser.query(api.users.getAllUsers, {});
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("users.updateUserRoles succeeds for admin and updates role", async () => {
    const t = createTest();
    const { asUser: asAdmin } = await createAdminUser(t);
    const { userId: targetUserId } = await createTestUser(t, {
      name: "Target User",
      roles: ["user"],
    });

    // Update the target user's roles to admin
    await asAdmin.mutation(api.users.updateUserRoles, {
      userId: targetUserId,
      roles: ["admin"],
    });

    // Verify the role was updated
    const users = await asAdmin.query(api.users.getAllUsers, {});
    const targetUser = users.find((u) => u._id === targetUserId);
    expect(targetUser).toBeDefined();
    expect(targetUser!.roles).toEqual(["admin"]);
  });
});
