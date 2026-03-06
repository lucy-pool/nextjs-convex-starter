"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/utils";
import { PasswordInput, isPasswordValid } from "@/components/auth/password-input";

export default function ForgotPasswordPage() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn("password", { email, flow: "reset" });
    } catch {
      // Don't reveal whether the email exists
    } finally {
      setLoading(false);
      setStep("code");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await signIn("password", {
        email,
        code,
        newPassword,
        flow: "reset-verification",
      });
      window.location.href = "/dashboard";
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setLoading(true);
    try {
      await signIn("password", { email, flow: "reset" });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch = newPassword === confirmPassword || confirmPassword === "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-card-foreground">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "email"
              ? "Enter your email to reset your password"
              : "Enter the code sent to your email"}
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-card-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending..." : "Send Reset Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="code"
                className="text-sm font-medium text-card-foreground"
              >
                Reset Code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-center tracking-widest font-mono text-lg"
                placeholder="000000"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="newPassword"
                className="text-sm font-medium text-card-foreground"
              >
                New Password
              </label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={setNewPassword}
                showRequirements
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-card-foreground"
              >
                Confirm Password
              </label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
              {!passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !isPasswordValid(newPassword) || !passwordsMatch}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={loading}
              className="w-full text-center text-sm text-muted-foreground hover:text-primary hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/signin"
            className="font-medium text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
