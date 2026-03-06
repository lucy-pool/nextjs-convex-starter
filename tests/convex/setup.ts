// Import all convex modules for convex-test.
// convex-test needs this to resolve function references in subdirectories.
export const modules = import.meta.glob(
  ["../../convex/**/*.ts", "../../convex/**/*.tsx", "!../../convex/convex.config.ts"],
);
