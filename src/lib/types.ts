import type { Finding } from "./validation";

export function parseFindings(value: unknown): Finding[] {
  return Array.isArray(value) ? (value as Finding[]) : [];
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
