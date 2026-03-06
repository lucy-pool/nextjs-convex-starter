// Type declaration for Vite's import.meta.glob used by convex-test setup
interface ImportMeta {
  glob(
    patterns: string | string[],
    options?: { eager?: boolean }
  ): Record<string, () => Promise<unknown>>;
}
