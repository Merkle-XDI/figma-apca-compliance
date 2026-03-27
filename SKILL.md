# APCA Accessibility Skill

## What This Skill Does

This skill integrates APCA (Advanced Perceptual Contrast Algorithm) directly into the Figma design process — not as a post-design compliance checker, but as a generative, design-time tool. It works in two parts:

- **Part 1 — Variable Remapping**: Audit and remap a component's color variables to be APCA-compliant for any target Lc level
- **Part 2 — Component Iterator**: Generate a range of component variations using APCA-compliant variables, driven by user-specified Lc targets and use-case context

This skill operates both **on canvas** (reading/writing via Figma MCP) and **in generation mode** (Figma Make / AI-assisted design flows).

---

## APCA Core Reference

Before executing any task, internalize these APCA fundamentals. They govern every decision in both parts.

### How APCA Works

APCA measures **Lc (Lightness Contrast)** — a perceptually uniform value from 0 to ±106 (positive = dark text on light BG / light mode; negative = light text on dark BG / dark mode). Use the absolute value for threshold comparisons.

APCA is **polarity-aware**: the text color and background color must be evaluated in the correct order. Dark text on light BG yields a positive Lc. Light text on dark BG yields a negative Lc. This distinction is critical for dark mode — WCAG 2.x cannot correctly evaluate dark mode; APCA can.

### Lc Level Reference Table

| Lc Level | Use Case |
|----------|----------|
| Lc 15 | Absolute minimum for non-semantic, non-text elements (dividers, borders, focus outlines ≥5px). Treat anything below this as invisible. |
| Lc 30 | Absolute minimum for any text. Suitable only for placeholder or disabled/decorative text. |
| Lc 45 | Minimum for large/heavy text (headings, prominent labels). Minimum sizes: 36px/400 weight or 24px/700 weight. |
| Lc 60 | Minimum for content text that is not body copy (short labels, captions, UI annotations). Minimum sizes: 24px/400 or 16px/700. |
| Lc 75 | Minimum for columns of body text. Minimum size: 18px/400. Treat as the floor for any text where readability matters. |
| Lc 90 | Preferred for fluent body text and reading scenarios. Minimum size: 14px/400. Also the **maximum recommended for dark mode large fonts** (keep ≤ Lc 90 to avoid halation). |

AAA equivalent: Add Lc 15 to any threshold above.

### APCA Algorithm (JavaScript — apca-w3)

Use the following implementation for all Lc calculations. This is the W3-licensed reference implementation.

```javascript
// APCA-W3 0.0.98G-4g
// Source: https://github.com/Myndex/apca-w3
// License: W3C / Accessible Reading Technologies

function sRGBtoY(rgb) {
  // rgb is an array [R, G, B] with values 0–255
  function linearize(val) {
    val /= 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  }
  return 0.2126729 * linearize(rgb[0]) +
         0.7151522 * linearize(rgb[1]) +
         0.0721750 * linearize(rgb[2]);
}

function APCAcontrast(textRGB, bgRGB) {
  const SA98G = {
    mainTRC: 2.4,
    Ntex: 0.57, Nbg: 0.56,
    Rtex: 0.62, Rbg: 0.65,
    W_scale: 1.14,
    W_offset: 0.027,
    Lo_clip: 0.1,
    delta_Y_min: 0.0005,
    Blk_thr: 0.022, Blk_clmp: 1.414,
  };

  let Ytxt = sRGBtoY(textRGB);
  let Ybg  = sRGBtoY(bgRGB);

  // Black clamp
  Ytxt = Ytxt > SA98G.Blk_thr ? Ytxt : Ytxt + Math.pow(SA98G.Blk_thr - Ytxt, SA98G.Blk_clmp);
  Ybg  = Ybg  > SA98G.Blk_thr ? Ybg  : Ybg  + Math.pow(SA98G.Blk_thr - Ybg,  SA98G.Blk_clmp);

  let Lc = 0;
  if (Math.abs(Ybg - Ytxt) < SA98G.delta_Y_min) return 0;

  if (Ybg > Ytxt) {
    // Normal polarity (dark text on light BG)
    Lc = (Math.pow(Ybg, SA98G.Nbg) - Math.pow(Ytxt, SA98G.Ntex)) * SA98G.W_scale;
    Lc = Lc < SA98G.Lo_clip ? 0 : Lc - SA98G.W_offset;
  } else {
    // Reverse polarity (light text on dark BG)
    Lc = (Math.pow(Ybg, SA98G.Rbg) - Math.pow(Ytxt, SA98G.Rtex)) * SA98G.W_scale;
    Lc = Lc > -SA98G.Lo_clip ? 0 : Lc + SA98G.W_offset;
  }

  return Math.round(Lc * 100) / 100; // Returns signed Lc value
}

// Usage:
// APCAcontrast([0,0,0], [255,255,255]) → ~106 (black on white)
// APCAcontrast([255,255,255], [0,0,0]) → ~-107 (white on black)
// Use Math.abs(result) to compare against threshold tables

function hexToRGB(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  return [
    parseInt(hex.substring(0,2), 16),
    parseInt(hex.substring(2,4), 16),
    parseInt(hex.substring(4,6), 16)
  ];
}
```

### Dark Mode Polarity Note

In dark mode, APCA returns a **negative Lc** (e.g., Lc -72). When comparing to a threshold, use the absolute value. When generating dark mode tokens, keep the target within `|Lc| 45–90`. Lc values above 90 in dark mode can cause halation (glowing effect), reducing readability despite high contrast.

---

## Part 1 — Variable Remapping

**Goal:** Read the component's existing color variables, calculate their current Lc values, identify which fail the target threshold, and propose (or apply) new values that meet or exceed the target Lc.

### Step-by-Step Process

#### 1. Extract Variables from the Component

**Via Figma MCP (on-canvas):**
```
Call: get_variable_defs
Purpose: Extract all color variables and their resolved hex values used in the selection.
```

Parse the response to build a variable map:
```
{
  "variableName": { "value": "#hexcolor", "role": "text|background|border|fill|icon" }
}
```

If `get_variable_defs` only returns default mode values, also call `get_design_context` to infer roles (what is text, what is background) from the component's layer structure.

**Via Figma Make / generation flow:**
Ask the user to provide variable names and their hex values, or infer them from the component description. Build the same variable map.

#### 2. Infer Color Roles

For each variable, determine its role:
- **Text / Label**: Any variable applied to text layers
- **Background**: The layer behind text (frame fill, component background)
- **Icon / Non-text**: Decorative or functional icons, dividers, borders

Role inference rules:
- If a variable name contains `text`, `label`, `copy`, `title`, `heading`, `caption`, `placeholder` → text role
- If a variable name contains `bg`, `background`, `surface`, `fill` → background role
- If a variable name contains `icon`, `border`, `divider`, `outline`, `stroke` → non-text role
- When in doubt, use `get_design_context` layer structure to confirm

#### 3. Build Contrast Pairs

For each text/icon variable, identify its background pairing. Common patterns:
- `color/text-primary` paired with `color/surface-default`
- `color/button-label` paired with `color/button-fill`
- `color/icon-on-primary` paired with `color/primary`

If pairing is ambiguous, ask the user: *"What background does [variable name] sit on?"*

#### 4. Calculate Current Lc Values

For each contrast pair, run `APCAcontrast(textRGB, bgRGB)` using the extracted hex values. Report:

```
Variable Pair               Current Lc   Target Lc   Status
──────────────────────────────────────────────────────────
color/label on color/btn-bg    Lc 41        Lc 60      ❌ Fails
color/title on color/surface   Lc 78        Lc 75      ✅ Passes
color/caption on color/card    Lc 52        Lc 60      ❌ Fails
```

#### 5. Propose Compliant Values

For each failing pair, find a replacement color that:
1. Meets or exceeds the target Lc
2. Stays within the same hue family as the original (unless user requests a new palette)
3. Stays within dark mode range (|Lc| ≤ 90) if in dark mode

**Algorithm for finding compliant text color (given a fixed background):**

```javascript
// Adjust lightness of text color until Lc target is met
function findCompliantTextColor(bgHex, targetLc, isDarkMode, seedHex = null) {
  const bgRGB = hexToRGB(bgHex);
  const seed = seedHex ? hexToRGB(seedHex) : null;

  // Try adjusting luminance: for light mode, darken text; for dark mode, lighten text
  // Step through HSL lightness in 1% increments
  for (let L = isDarkMode ? 95 : 5; isDarkMode ? L >= 5 : L <= 95; isDarkMode ? L-- : L++) {
    const candidateRGB = hslToRGB(seed ? rgbToHue(seed) : 0, seed ? rgbToSat(seed) : 0, L / 100);
    const lc = Math.abs(APCAcontrast(candidateRGB, bgRGB));
    if (lc >= Math.abs(targetLc)) {
      return rgbToHex(candidateRGB);
    }
  }
  return null; // No compliant color found at this hue/saturation
}
```

**Algorithm for finding compliant background color (given a fixed text color):**

Use this when the text color is brand-locked or cannot change — e.g., white label on a colored surface — and the background must move instead. This is the symmetric counterpart to `findCompliantTextColor` and is the correct tool for fixing mid-luminance surface traps (see Edge Cases).

```javascript
// Find a background color that achieves targetLc against a fixed text color.
// seedHex: the current/existing background hex — used to preserve hue.
// isDarkMode: if true, searches toward darker backgrounds; if false, toward lighter.
function findCompliantBgColor(textHex, targetLc, isDarkMode, seedHex = null) {
  const textRGB = hexToRGB(textHex);
  const seed = seedHex ? hexToRGB(seedHex) : null;

  // For dark mode: darken the background (lower L) to increase contrast against light text
  // For light mode: lighten the background (raise L) to increase contrast against dark text
  const start = isDarkMode ? 40 : 60;
  const end   = isDarkMode ? 0  : 100;
  const step  = isDarkMode ? -1 : 1;

  for (let L = start; isDarkMode ? L >= end : L <= end; L += step) {
    const hue = seed ? rgbToHue(seed) : 0;
    const sat = seed ? rgbToSat(seed) : 0;
    const candidateRGB = hslToRGB(hue, sat, L / 100);
    const lc = Math.abs(APCAcontrast(textRGB, candidateRGB));
    if (lc >= Math.abs(targetLc)) {
      return rgbToHex(candidateRGB);
    }
  }
  return null; // Target Lc not achievable at this hue/saturation — palette change required
}

// Decision logic: which search direction to use?
// ┌──────────────────────────────────────┬──────────────────────────────────┐
// │ Situation                            │ Use                              │
// ├──────────────────────────────────────┼──────────────────────────────────┤
// │ Text is free to change               │ findCompliantTextColor           │
// │ Text is brand-locked (e.g. white)    │ findCompliantBgColor             │
// │ findCompliantTextColor returns null  │ Switch to findCompliantBgColor   │
// │ Both return null                     │ Mid-luminance trap — see below   │
// └──────────────────────────────────────┴──────────────────────────────────┘
```

Present alternatives as a ranked table:
```
Proposed replacements for color/label (target: Lc 60):
  Option A: #1A1A2E  →  Lc 68  (darkened, same hue)
  Option B: #0D0D1A  →  Lc 74  (more conservative, AAA equivalent)
  Option C: #2C2C54  →  Lc 62  (preserves brand hue)
```

#### 6. Apply to Figma (MCP Write Path)

If the user approves, apply changes via the Figma MCP or Plugin API:

**Using `use_figma` (Plugin API via MCP):**
```javascript
// Get the variable by name and update its value
const collection = figma.variables.getLocalVariableCollections()
  .find(c => c.name === "Colors" /* or relevant collection name */);

const variable = figma.variables.getLocalVariables()
  .find(v => v.name === "color/label");

const modeId = collection.modes[0].modeId; // or specific mode for dark/light

variable.setValueForMode(modeId, { r: 0.1, g: 0.1, b: 0.18 }); // normalized 0–1
```

If using `figma_batch_update_variables` (southleft MCP):
```json
{
  "updates": [
    { "variableId": "123:45", "modeId": "456:0", "value": { "r": 0.1, "g": 0.1, "b": 0.18 } },
    { "variableId": "123:46", "modeId": "456:0", "value": { "r": 0.95, "g": 0.95, "b": 0.97 } }
  ]
}
```

Always confirm the write succeeded by re-running `get_variable_defs` and recalculating Lc values to verify.

#### 7. Output Summary

After remapping, provide a summary:
```
APCA Remap Complete — Dark Mode Pass
──────────────────────────────────────
3 variables updated, 2 already compliant

Updated:
  color/label           #4B4B99 → #E8E8FF   Lc 41 → Lc 68  ✅
  color/caption         #666699 → #C5C5FF   Lc 52 → Lc 63  ✅
  color/icon-primary    #7777AA → #D0D0FF   Lc 38 → Lc 61  ✅

Unchanged:
  color/heading         #FFFFFF             Lc 87           ✅
  color/divider         #3A3A5C             Lc 22           ✅ (non-text, Lc 15+ sufficient)

Dark mode max Lc check: All values ≤ Lc 90 ✅
```

---

## Part 2 — Component Iterator

**Goal:** Using APCA-compliant variables (from Part 1 or existing), generate a set of component variations targeting a user-specified Lc level. Each variation should be design-ready and directly applicable in Figma.

### Inputs to Collect from User

Before generating, confirm:
1. **Component**: Which component or component set? (Get via `get_design_context` or user description)
2. **Target Lc**: What Lc level(s) to target? (e.g., "at least Lc 45", "Lc 60–75 range", "Lc 90 preferred")
3. **Mode**: Light mode, dark mode, or both?
4. **Scope**: Which elements need to meet the Lc target? (e.g., "button labels only", "all text", "icons too")
5. **Variable strategy**: Use existing variables, propose new ones, or create a new variable collection (e.g., a new Dark mode)?

### Generation Workflow

#### Step 1: Read the Component

```
Call: get_design_context   (to understand layer structure, component variants, applied variables)
Call: get_variable_defs    (to get current variable names + values)
Call: get_screenshot       (for visual reference — confirm layout before generating)
```

Build a component model:
```
Component: Button
Variants: [Primary, Secondary, Disabled]
Layers:
  - Frame (fill: color/button-primary-bg)
    - Label (fill: color/button-label-on-primary)
    - Icon  (fill: color/icon-on-primary, optional)
Contrast pairs:
  - Label on BG:  color/button-label-on-primary / color/button-primary-bg
  - Icon on BG:   color/icon-on-primary / color/button-primary-bg
```

#### Step 2: Calculate Lc for Each Variant

Run Lc calculations for every contrast pair across all variants. Create a contrast matrix:

```
Variant      | Label Lc | Icon Lc | BG Lc (on page)
─────────────────────────────────────────────────────
Primary      |  Lc 78   |  Lc 72  |  Lc 44
Secondary    |  Lc 55   |  Lc 51  |  Lc 31
Disabled     |  Lc 29   |  Lc 27  |  Lc 18
```

Note: Disabled/placeholder text intentionally uses Lc 30 as its ceiling.

#### Step 3: Generate Variations to Hit Target Lc

For the user's target Lc (e.g., "button labels at least Lc 45"):

Generate a set of variations across a meaningful range above the target threshold. Default range: `targetLc`, `targetLc + 15`, `targetLc + 30`. This gives the user three levels to choose from — minimal compliance, comfortable, and high contrast.

For each variation:
- Calculate what the text/icon color needs to be to hit that Lc against the existing background
- Or calculate what the background needs to be if the text color is fixed
- Apply hue preservation where possible (stay within the color family)
- Flag any dark mode violations (Lc > 90)

**Example output for "dark mode button label at least Lc 45":**

```
Variation A — Lc 47 (Minimal Compliance)
  color/button-primary-bg:    #1E3A5F
  color/button-label-on-primary: #9BBEDD
  Label Lc: 47 ✅  |  Icon Lc: 44 ⚠️ (below target, consider adjusting icon)

Variation B — Lc 62 (Comfortable)
  color/button-primary-bg:    #1E3A5F
  color/button-label-on-primary: #C8E4F8
  Label Lc: 62 ✅  |  Icon Lc: 58 ✅

Variation C — Lc 78 (High Contrast)
  color/button-primary-bg:    #1E3A5F
  color/button-label-on-primary: #EAF4FC
  Label Lc: 78 ✅  |  Icon Lc: 75 ✅
  Note: Approaching Lc 90 max for dark mode — leave room for AAA upgrade path.
```

#### Step 4: Write Variations to Figma

**Option A — New Variable Mode (recommended for dark mode):**
Create a new mode in the existing variable collection (e.g., "Dark" mode) with the proposed values:

```javascript
// Via Plugin API / use_figma
const collection = figma.variables.getLocalVariableCollections()
  .find(c => c.name === "Colors");
const newModeId = collection.addMode("Dark"); // or "Dark – Lc60"

// Set values for each variable in the new mode
variables.forEach(({ name, darkValue }) => {
  const v = figma.variables.getLocalVariables().find(v => v.name === name);
  v.setValueForMode(newModeId, darkValue); // darkValue as { r, g, b } normalized
});
```

**Option B — New Component Variants on Canvas:**
Duplicate existing component frames and apply the new variable values as overrides. Name each variant to communicate its Lc level:

```
Button/Primary/Dark-Lc47
Button/Primary/Dark-Lc62
Button/Primary/Dark-Lc78
```

Arrange variants in a comparison frame with labels showing the Lc value for quick visual review.

**Option C — Annotation Layer:**
If the user just wants to see the options without modifying variables, create an annotation frame beside the component showing color swatches, hex values, and Lc values for each proposed variation.

#### Step 5: Present Results

After generation, show the user:
1. A screenshot of the generated variants (`get_screenshot`)
2. A contrast summary table for each variant
3. Recommendation: which variation best balances readability, aesthetics, and margin above the target Lc
4. Any variables that still need attention (e.g., secondary variants, disabled states)

---

## Working with Figma MCP — Tool Reference

| Task | Tool to Use |
|------|-------------|
| Read component structure + variables | `get_design_context` + `get_variable_defs` |
| Get visual reference | `get_screenshot` |
| Write variable values (single) | `use_figma` with Plugin API `setValueForMode` |
| Write variable values (batch) | `figma_batch_update_variables` (southleft MCP) |
| Create new variable collection / mode | `figma_setup_design_tokens` or Plugin API |
| Create component variants on canvas | `use_figma` with Plugin API frame/component creation |
| Read back to verify | `get_variable_defs` with `refreshCache: true` |

**MCP Limitation Note:** Figma's official MCP (`get_variable_defs`) currently only returns default mode values. If multi-mode variable reading is required, use the southleft `figma-console-mcp` Plugin API bridge or prompt the user to export variables as JSON via Tokens Studio / Style Dictionary first.

---

## Prompting Patterns

Use these prompt templates when activating the skill:

**Part 1 — Remap existing variables:**
> "Audit the color variables in this component for APCA compliance. My button labels need to be at least Lc 60. Show me what fails and propose compliant replacements that stay in the same blue hue family."

**Part 2 — Generate dark mode variations:**
> "Using the current light mode button variables, help me create a dark mode version of this component where button labels are at least Lc 45. Generate three variations at different contrast levels so I can compare."

**Combined flow:**
> "First remap my existing variables to be APCA compliant at Lc 75 for body text. Then generate three dark mode variants of this card component at Lc 45, Lc 60, and Lc 75 for the card title."

**Background search (brand-locked text):**
> "My button label must stay white. Find me a dark mode button background that hits at least Lc 60 against white, staying in the same blue hue family as the current background."

**Mid-luminance trap:**
> "My success surface is #14ae5c and nothing passes against it. Give me my options — I don't want to auto-apply anything until I've reviewed the palette implications."

**Halation fix:**
> "My dark mode base background is causing halation on all white text. Find the darkest background I can use that keeps Lc at or below 90, then apply it to BG/Default/Default dark only after I confirm."

---

## Edge Cases and Rules

- **Disabled / placeholder states**: Target Lc 30 maximum (intentionally low to signal inactivity). Do not force these to Lc 45+.
- **Decorative / non-text elements**: Use Lc 15 as minimum. Borders and dividers do not need body-text contrast levels.
- **Dark mode ceiling**: Never recommend Lc > 90 for dark mode text. Lc 90 is both the preferred body text target and the dark mode maximum. Excess contrast causes halation.
- **Icon contrast**: Icons follow the same thresholds as text at their visual size. An icon that functions as a label should meet the same Lc as a label.
- **WCAG 2.x coexistence**: If the user needs to remain WCAG 2.x compatible, note approximate equivalences (Lc 60 ≈ 3:1; Lc 75 ≈ 4.5:1; Lc 90 ≈ 7:1) but clarify these are approximations for light mode only. APCA and WCAG 2.x diverge significantly for dark mode.
- **Font weight / size adjustments**: If hitting the target Lc is impossible without breaking the color palette, offer the alternative of increasing font size or weight instead (e.g., going from 400 to 700 weight reduces the required Lc by approximately 15 points).
- **npm package**: For implementation outside of Claude, the reference implementation is available as `npm i apca-w3`. Always use the W3-licensed version (`apca-w3`) for any WCAG 3.0 compatibility work.

### Mid-Luminance Surface Trap

A mid-luminance surface trap occurs when a background color sits in the middle of the luminance range (roughly Y 0.15–0.40) such that **neither black nor white text can achieve the target Lc against it**. This is the hardest class of APCA failure to fix with alias remapping alone because no text color adjustment will solve it — the surface itself must move.

**How to detect it:**
```javascript
function isMidLuminanceTrap(bgHex, targetLc) {
  const bgRGB = hexToRGB(bgHex);
  const maxWithBlack = Math.abs(APCAcontrast([0, 0, 0],     bgRGB));
  const maxWithWhite = Math.abs(APCAcontrast([255, 255, 255], bgRGB));
  return Math.max(maxWithBlack, maxWithWhite) < targetLc;
}
// If this returns true: the surface color itself must change. No text remapping will fix it.
```

**Common culprits:** Mid-tone greens (#14ae5c), yellows (#e8b931), reds (#ec221f), and oranges used as status/semantic surface colors. These are perceptually vivid but APCA-problematic because their luminance lands in the trap zone.

**Resolution options — present all three to the user, do not auto-apply:**

1. **Darken the surface** (recommended for light mode): Push the background darker so light text achieves the target Lc. Use `findCompliantBgColor(whiteHex, targetLc, false, surfaceHex)` searching downward from current lightness.
   ```
   Before: #14ae5c (Positive/Green) — max achievable Lc with any text: ~52
   After:  #0a7a3e — white text achieves Lc 61 ✅
   ```

2. **Lower the Lc target + compensate with typography**: If the surface is brand-locked and cannot darken, drop the target Lc to the maximum achievable (e.g., Lc 50 instead of Lc 75) and compensate by requiring heavier font weight (700) and larger size (≥18px). This is a product decision, not an automatic fix.

3. **Swap text polarity**: Instead of text-on-colored-surface, invert to colored-text-on-neutral-surface (e.g., dark green label on white card). This sidesteps the surface trap entirely and often produces better visual results. Re-run `findCompliantTextColor` with the brand color as text against the neutral background.

**In the variable audit output**, flag these explicitly — do not list them as simple "update variable" fixes:
```
⚠️  MID-LUMINANCE TRAP — requires palette decision
    Text/Positive/On Positive on BG/Positive/Default
    Background: #14ae5c  Max achievable Lc (any text): ~52  Target: Lc 75
    Options: (A) darken surface to #0a7a3e  (B) lower target + heavier font  (C) invert polarity
```

### Dark Mode Halation Fix

Halation occurs when Lc exceeds 90 in dark mode (e.g., pure white #ffffff on near-black #1e1e1e → Lc ~101). Despite the high contrast number, the glow effect reduces readability and causes eye strain.

**Detection:**
```javascript
function isHalation(textHex, bgHex) {
  const lc = APCAcontrast(hexToRGB(textHex), hexToRGB(bgHex));
  return lc < -90; // Negative = dark mode; more negative than -90 = halation
}
```

**Fix — soften the background, not the text:**
The correct fix is to raise the dark background slightly (increase its luminance), not to gray out the text. Graying the text reduces legibility; raising the background reduces halation while maintaining perceived contrast in the comfortable Lc 75–88 range.

```javascript
// Find the darkest background that keeps Lc ≤ 90 (halation ceiling)
// while staying as dark as possible (preserving dark mode feel)
function findHalationSafeBg(textHex, seedBgHex) {
  const textRGB = hexToRGB(textHex);
  const seed    = hexToRGB(seedBgHex);

  // Search upward from current BG lightness until |Lc| drops to ≤ 90
  for (let L = rgbToLightness(seed) * 100; L <= 35; L += 0.5) {
    const candidateRGB = hslToRGB(rgbToHue(seed), rgbToSat(seed), L / 100);
    const lc = APCAcontrast(textRGB, candidateRGB);
    if (Math.abs(lc) <= 90) {
      return rgbToHex(candidateRGB);
    }
  }
  return null;
}
```

**Typical result:**
```
Before: BG/Default/Default dark = #1e1e1e  →  White text Lc -101  ❌ Halation
After:  BG/Default/Default dark = #2a2a2a  →  White text Lc  -88  ✅ Safe
        BG/Default/Default dark = #2e2e2e  →  White text Lc  -85  ✅ More margin
```

**Important:** Changing the base dark background is a **product-level decision** — it affects every element in dark mode, not just the failing pair. Always flag this to the user and confirm before applying. Apply as a variable update to the base surface token, not as a per-component override.

---

## Licensing Notice

APCA is developed by Myndex Research / Accessible Reading Technologies (ART). The algorithm is used here under the W3C / open license for design tooling. This skill:
- Does NOT claim "APCA Compliant" certification (which requires formal evaluation by Myndex/ART)
- DOES correctly implement the APCA-W3 0.0.98G algorithm
- Uses the term "Lc value" and "perceptual contrast" per the minimum compliance guidelines
- Is prohibited for use in medical, clinical, aerospace, transportation, automotive, or military applications without a specific written license from Myndex Research

For more information: https://git.apcacontrast.com/documentation/WhyAPCA
