import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Reproducible contrast check for representative palette combinations whose
 * backgrounds are semi-transparent panels over a page gradient. These checks
 * complement axe-core's unresolved colour-contrast review; they do not map to
 * every individual axe node. Every colour below is read from, or asserted to
 * exist in, app/globals.css so a palette change fails here.
 *
 * Thresholds follow WCAG 2.x: 4.5:1 for text (1.4.3) and 3:1 for the focus
 * indicator against its adjacent background (1.4.11).
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

type Rgb = [number, number, number];

function token(name: string): Rgb {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`globals.css does not define --${name} as a hex colour`);
  return hex(match[1]);
}

function literal(value: string): Rgb {
  expect(css.toLowerCase(), `${value} is no longer used in globals.css`).toContain(
    value.toLowerCase()
  );
  return hex(value);
}

function overlay(rgba: string): { colour: Rgb; alpha: number } {
  expect(css, `${rgba} is no longer used in globals.css`).toContain(rgba);
  const parts = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!parts) throw new Error(`Cannot parse ${rgba}`);
  return {
    colour: [Number(parts[1]), Number(parts[2]), Number(parts[3])],
    alpha: Number(parts[4])
  };
}

function hex(value: string): Rgb {
  return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16)) as Rgb;
}

function blend(top: { colour: Rgb; alpha: number }, bottom: Rgb): Rgb {
  return top.colour.map((channel, index) =>
    Math.round(top.alpha * channel + (1 - top.alpha) * bottom[index])
  ) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const bg = token("bg");
const ink = token("ink");
const muted = token("muted");
const accent = token("accent");
const accentStrong = token("accent-strong");
const warning = token("warning");
const focusRing = token("focus-ring");
const panelSoft = token("panel-soft");
const white: Rgb = [255, 255, 255];

// Strongest point of the body's radial gradient, over the page background.
const gradientHotspot = blend(overlay("rgba(32, 92, 74, 0.12)"), bg);
// Cards and panels: translucent white over the page, with and without the gradient.
const panel = blend(overlay("rgba(255, 255, 255, 0.82)"), bg);
const panelOnHotspot = blend(overlay("rgba(255, 255, 255, 0.82)"), gradientHotspot);
const warmField = literal("#fffdfa");
const darkPanel = literal("#173f34");
const darkPanelText = literal("#cbe0d8");
const errorBackground = blend(overlay("rgba(159, 47, 39, 0.07)"), panel);
const chipBackground = blend(overlay("rgba(32, 92, 74, 0.1)"), panel);

const textPairs: Array<[string, Rgb, Rgb]> = [
  ["muted text on a panel", muted, panel],
  ["muted text on a panel over the gradient hotspot", muted, panelOnHotspot],
  ["muted text on panel-soft (example ideas, secondary buttons)", muted, panelSoft],
  ["ink text on panel-soft", ink, panelSoft],
  ["ink text in a warm input field", ink, warmField],
  ["accent eyebrow text on the page background", accent, bg],
  ["accent eyebrow text on the gradient hotspot", accent, gradientHotspot],
  ["white text on the primary button", white, accent],
  ["process-panel text on the dark panel", darkPanelText, darkPanel],
  ["white text on the dark panel", white, darkPanel],
  ["warning message on the error background", warning, errorBackground],
  ["muted reference line on the error background", muted, errorBackground],
  ["accent-strong chip text on the chip background", accentStrong, chipBackground]
];

const focusPairs: Array<[string, Rgb, Rgb]> = [
  ["focus ring against the page background", focusRing, bg],
  ["focus ring against the gradient hotspot", focusRing, gradientHotspot],
  ["focus ring against a panel (fields, buttons in the form)", focusRing, panel],
  ["focus ring against panel-soft (advanced options)", focusRing, panelSoft],
  ["focus ring against the error background (retry button)", focusRing, errorBackground]
];

describe("colour contrast of representative palette combinations", () => {
  it.each(textPairs)("%s reaches 4.5:1", (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(focusPairs)("%s reaches 3:1", (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it("documents the measured ratios", () => {
    const table = [...textPairs, ...focusPairs]
      .map(([label, fg, bgc]) => `${contrast(fg, bgc).toFixed(2)}:1  ${label}`)
      .join("\n");
    console.log(table);
    expect(table.length).toBeGreaterThan(0);
  });
});
