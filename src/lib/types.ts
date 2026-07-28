import type { Finding } from "./validation";

export function parseFindings(json: string): Finding[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const SEVERITY_ORDER: Record<Finding["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}
