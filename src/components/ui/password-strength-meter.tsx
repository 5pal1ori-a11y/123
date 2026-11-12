"use client";

import { evaluatePasswordStrength } from "@/lib/password-strength";

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = evaluatePasswordStrength(password);
  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              backgroundColor: i < strength.score ? strength.color : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>
      <p className="text-xs" style={{ color: strength.color }}>
        {strength.label}
        {strength.hints.length > 0 ? ` · ${strength.hints.slice(0, 2).join(", ")}` : ""}
      </p>
    </div>
  );
}
