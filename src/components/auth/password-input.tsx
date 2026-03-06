"use client";

import { useState } from "react";

const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
] as const;

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
  required = true,
  showRequirements = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  showRequirements?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {showRequirements && value && (
        <ul className="space-y-1 text-xs">
          {PASSWORD_RULES.map((rule) => {
            const passed = rule.test(value);
            return (
              <li key={rule.label} className="flex items-center gap-1.5">
                {passed ? (
                  <svg className="h-3.5 w-3.5 text-green-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="3" />
                  </svg>
                )}
                <span className={passed ? "text-green-500" : "text-muted-foreground"}>
                  {rule.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function isPasswordValid(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
