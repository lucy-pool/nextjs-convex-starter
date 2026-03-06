import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1_000_000).padStart(6, "0");
}

const ResetPasswordEmail = Email({
  id: "reset-password",
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    return generateOTP();
  },
  async sendVerificationRequest({ identifier: email, token, expires }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM ?? "noreply@example.com";
    const appName = process.env.APP_NAME ?? "Sherif Starter";

    if (!apiKey) {
      console.error("RESEND_API_KEY not set — cannot send password reset email");
      return;
    }

    const expiresIn = Math.round((expires.getTime() - Date.now()) / 60000);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${appName} — Password Reset Code`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="margin-bottom: 16px;">Reset your password</h2>
            <p>Use the code below to reset your password. It expires in ${expiresIn} minutes.</p>
            <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; font-family: monospace;">${token}</span>
            </div>
            <p style="color: #71717a; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Failed to send password reset email:", body);
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, GitHub, Password({ reset: ResetPasswordEmail })],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      // Only fire for newly created users
      if (existingUserId) return;

      const user = await ctx.db.get(userId);
      if (!user?.email) return;

      const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
      const name = user.name ?? user.email.split("@")[0];

      await ctx.scheduler.runAfter(
        0,
        internal.email.logs.createEmailLog,
        {
          to: user.email,
          template: "welcome" as const,
          templateData: JSON.stringify({
            name,
            loginUrl: `${siteUrl}/dashboard`,
          }),
        }
      );
    },
  },
});
