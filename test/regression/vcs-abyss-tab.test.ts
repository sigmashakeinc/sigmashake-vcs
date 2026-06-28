import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const indexHtml = readFileSync(join(ROOT, "static", "index.html"), "utf8");
const panelJs = readFileSync(join(ROOT, "static", "panel.js"), "utf8");
const panelCss = readFileSync(join(ROOT, "static", "panel.css"), "utf8");

describe("VCS SIGMA ABYSS tab", () => {
  test("exposes the Abyss tab in the VCS pager", () => {
    expect(indexHtml).toContain('data-tab="abyss"');
    expect(indexHtml).toContain("SIGMA ABYSS auto battle");
  });

  test("lazy-loads the public SIGMA ABYSS edge realm", () => {
    expect(indexHtml).toContain('data-src="https://mmo.sigmashake.com/?embed=vcs"');
    expect(panelJs).toContain('if (name === "abyss") loadAbyssTab();');
    expect(panelJs).toContain("function loadAbyssTab()");
  });

  test("keeps the embedded realm inside the fixed-height VCS panel", () => {
    expect(panelCss).toContain('.tab-panel[data-tab="abyss"]');
    expect(panelCss).toContain(".abyss-frame");
    expect(panelCss).toContain("min-height: 420px");
  });
});
