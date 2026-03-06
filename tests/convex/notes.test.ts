import { describe, it, expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTest, createTestUser } from "./helpers";

describe("Notes CRUD", () => {
  it("create and list a note", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    const noteId = await asUser.mutation(api.notes.create, {
      title: "My Note",
      body: "Note body",
      isPublic: false,
    });

    const notes = await asUser.query(api.notes.list, {});
    expect(notes).toHaveLength(1);
    expect(notes[0]._id).toBe(noteId);
    expect(notes[0].title).toBe("My Note");
    expect(notes[0].body).toBe("Note body");
    expect(notes[0].isPublic).toBe(false);
  });

  it("update a note", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    const noteId = await asUser.mutation(api.notes.create, {
      title: "Original",
      body: "Original body",
      isPublic: false,
    });

    await asUser.mutation(api.notes.update, {
      id: noteId,
      title: "Updated",
      body: "Updated body",
      isPublic: true,
    });

    const notes = await asUser.query(api.notes.list, {});
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Updated");
    expect(notes[0].body).toBe("Updated body");
    expect(notes[0].isPublic).toBe(true);
  });

  it("delete a note", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    const noteId = await asUser.mutation(api.notes.create, {
      title: "To Delete",
      body: "Will be deleted",
      isPublic: false,
    });

    await asUser.mutation(api.notes.remove, { id: noteId });

    const notes = await asUser.query(api.notes.list, {});
    expect(notes).toHaveLength(0);
  });
});

describe("Notes data boundaries", () => {
  it("user cannot see another user's private notes", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    await asAlice.mutation(api.notes.create, {
      title: "Alice Private",
      body: "Secret",
      isPublic: false,
    });

    const bobNotes = await asBob.query(api.notes.list, {});
    expect(bobNotes).toHaveLength(0);
  });

  it("user can see another user's public notes", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    await asAlice.mutation(api.notes.create, {
      title: "Alice Public",
      body: "Shared",
      isPublic: true,
    });

    const bobNotes = await asBob.query(api.notes.list, {});
    expect(bobNotes).toHaveLength(1);
    expect(bobNotes[0].title).toBe("Alice Public");
  });

  it("user cannot update another user's note", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    const noteId = await asAlice.mutation(api.notes.create, {
      title: "Alice Note",
      body: "Body",
      isPublic: true,
    });

    await expect(
      asBob.mutation(api.notes.update, { id: noteId, title: "Hacked" })
    ).rejects.toThrow(/not found|access denied/i);
  });

  it("user cannot delete another user's note", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    const noteId = await asAlice.mutation(api.notes.create, {
      title: "Alice Note",
      body: "Body",
      isPublic: true,
    });

    await expect(
      asBob.mutation(api.notes.remove, { id: noteId })
    ).rejects.toThrow(/not found|access denied/i);
  });
});
