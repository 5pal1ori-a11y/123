export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  hints: string[];
};

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: "입력 필요", color: "#737373", hints: [] };
  }

  const hints: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else hints.push("8자 이상");

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else hints.push("대·소문자 혼합");

  if (/\d/.test(password)) score += 1;
  else hints.push("숫자 포함");

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else hints.push("특수문자 포함");

  const clamped = Math.min(4, score) as PasswordStrength["score"];
  const labels = ["매우 약함", "약함", "보통", "강함", "매우 강함"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

  return {
    score: clamped,
    label: labels[clamped],
    color: colors[clamped],
    hints,
  };
}
