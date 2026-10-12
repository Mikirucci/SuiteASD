import type { Page } from "@playwright/test";

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: Array<{ target: unknown[] }>;
}

declare global {
  interface Window {
    axe: {
      run: (
        context: Document,
        options: { runOnly: { type: "tag"; values: string[] } },
      ) => Promise<{ violations: AxeViolation[] }>;
    };
  }
}

/** Runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules, including colour contrast) in the real browser. */
export async function auditAccessibility(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    return results.violations;
  });
  return violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.help} -> ${violation.nodes.map((node) => String(node.target)).join(" | ")}`,
  );
}
