import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { modules } from "./setup";
import type { Id } from "../../convex/_generated/dataModel";

export { modules };

/**
 * Create a convex test instance with pre-loaded modules.
 */
export function createTest() {
  return convexTest(schema, modules);
}

/**
 * Seed a user directly in the DB and return an authenticated test accessor.
 * This bypasses Convex Auth's session tables since convex-test doesn't support them.
 */
export async function createTestUser(
  t: ReturnType<typeof convexTest>,
  opts: { name?: string; email?: string; roles?: ("user" | "admin")[] } = {}
) {
  const name = opts.name ?? "Test User";
  const email = opts.email ?? `${name.toLowerCase().replace(/\s/g, ".")}@test.com`;
  const roles = opts.roles ?? ["user"];

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name,
      email,
      roles,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // withIdentity sets ctx.auth.getUserIdentity() — getAuthUserId reads the
  // subject field to resolve the user ID. We pass the raw userId as subject.
  const asUser = t.withIdentity({
    name,
    email,
    subject: userId,
    tokenIdentifier: `test|${userId}`,
  });

  return { userId: userId as Id<"users">, asUser, name, email };
}

/**
 * Create an admin user.
 */
export async function createAdminUser(
  t: ReturnType<typeof convexTest>,
  opts: { name?: string; email?: string } = {}
) {
  return createTestUser(t, { ...opts, roles: ["admin"] });
}
