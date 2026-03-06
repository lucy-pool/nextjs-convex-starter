import { describe, it, expect } from "vitest";
import { api } from "../../../convex/_generated/api";
import { createTest, createTestUser } from "../helpers";

describe("AI Messages", () => {
  it("save and list messages", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    // Save a user message and an assistant message
    const userMsgId = await asUser.mutation(api.ai.messages.saveMessage, {
      role: "user",
      content: "Hello, assistant!",
    });
    const assistantMsgId = await asUser.mutation(api.ai.messages.saveMessage, {
      role: "assistant",
      content: "Hello! How can I help you?",
      model: "test-model",
    });

    expect(userMsgId).toBeDefined();
    expect(assistantMsgId).toBeDefined();

    // List messages and verify both are returned in order
    const messages = await asUser.query(api.ai.messages.listMessages, {});
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello, assistant!");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Hello! How can I help you?");
    expect(messages[1].model).toBe("test-model");
  });

  it("clearHistory removes all user messages", async () => {
    const t = createTest();
    const { asUser } = await createTestUser(t);

    // Save some messages
    await asUser.mutation(api.ai.messages.saveMessage, {
      role: "user",
      content: "Message 1",
    });
    await asUser.mutation(api.ai.messages.saveMessage, {
      role: "assistant",
      content: "Response 1",
    });

    // Verify messages exist
    let messages = await asUser.query(api.ai.messages.listMessages, {});
    expect(messages).toHaveLength(2);

    // Clear history
    await asUser.mutation(api.ai.messages.clearHistory, {});

    // Verify all messages are gone
    messages = await asUser.query(api.ai.messages.listMessages, {});
    expect(messages).toHaveLength(0);
  });

  it("users cannot see each other's messages", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    // Alice saves a message
    await asAlice.mutation(api.ai.messages.saveMessage, {
      role: "user",
      content: "Alice's message",
    });

    // Bob saves a message
    await asBob.mutation(api.ai.messages.saveMessage, {
      role: "user",
      content: "Bob's message",
    });

    // Alice only sees her own message
    const aliceMessages = await asAlice.query(api.ai.messages.listMessages, {});
    expect(aliceMessages).toHaveLength(1);
    expect(aliceMessages[0].content).toBe("Alice's message");

    // Bob only sees his own message
    const bobMessages = await asBob.query(api.ai.messages.listMessages, {});
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0].content).toBe("Bob's message");
  });

  it("clearHistory only clears own messages", async () => {
    const t = createTest();
    const { asUser: asAlice } = await createTestUser(t, { name: "Alice" });
    const { asUser: asBob } = await createTestUser(t, { name: "Bob" });

    // Both users save messages
    await asAlice.mutation(api.ai.messages.saveMessage, {
      role: "user",
      content: "Alice's message",
    });
    await asBob.mutation(api.ai.messages.saveMessage, {
      role: "user",
      content: "Bob's message",
    });

    // Alice clears her history
    await asAlice.mutation(api.ai.messages.clearHistory, {});

    // Alice's messages are gone
    const aliceMessages = await asAlice.query(api.ai.messages.listMessages, {});
    expect(aliceMessages).toHaveLength(0);

    // Bob's messages remain
    const bobMessages = await asBob.query(api.ai.messages.listMessages, {});
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0].content).toBe("Bob's message");
  });
});
