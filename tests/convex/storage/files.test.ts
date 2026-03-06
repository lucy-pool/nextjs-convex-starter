import { describe, it, expect, test } from "vitest";
import { api } from "../../../convex/_generated/api";
import { createTest, createTestUser } from "../helpers";

describe("Storage files", () => {
  it("store and list file metadata", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    const fileId = await asUser.mutation(api.storage.files.storeFileMetadata, {
      fileName: "photo.png",
      storageKey: "uploads/photo.png",
      mimeType: "image/png",
      size: 12345,
      fileType: "image",
    });

    expect(fileId).toBeDefined();

    const files = await asUser.query(api.storage.files.getMyFiles, {});
    expect(files).toHaveLength(1);
    expect(files[0]._id).toBe(fileId);
    expect(files[0].fileName).toBe("photo.png");
    expect(files[0].storageKey).toBe("uploads/photo.png");
    expect(files[0].mimeType).toBe("image/png");
    expect(files[0].size).toBe(12345);
    expect(files[0].fileType).toBe("image");
  });

  it("users only see their own files", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    await asAlice.mutation(api.storage.files.storeFileMetadata, {
      fileName: "alice-doc.pdf",
      storageKey: "uploads/alice-doc.pdf",
      mimeType: "application/pdf",
      size: 5000,
      fileType: "document",
    });

    await asBob.mutation(api.storage.files.storeFileMetadata, {
      fileName: "bob-audio.mp3",
      storageKey: "uploads/bob-audio.mp3",
      mimeType: "audio/mpeg",
      size: 80000,
      fileType: "audio",
    });

    const aliceFiles = await asAlice.query(api.storage.files.getMyFiles, {});
    expect(aliceFiles).toHaveLength(1);
    expect(aliceFiles[0].fileName).toBe("alice-doc.pdf");

    const bobFiles = await asBob.query(api.storage.files.getMyFiles, {});
    expect(bobFiles).toHaveLength(1);
    expect(bobFiles[0].fileName).toBe("bob-audio.mp3");
  });

  // Skipped: deleteFile calls r2.deleteObject which requires the R2 component,
  // not available in the convex-test environment.
  test.skip("user cannot delete another user's file", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    const fileId = await asAlice.mutation(api.storage.files.storeFileMetadata, {
      fileName: "alice-file.png",
      storageKey: "uploads/alice-file.png",
      mimeType: "image/png",
      size: 1000,
      fileType: "image",
    });

    await expect(
      asBob.mutation(api.storage.files.deleteFile, { fileId })
    ).rejects.toThrow(/not authorized/i);
  });
});
