# figma-apca-accessibility

A Claude skill that integrates **APCA (Advanced Perceptual Contrast Algorithm)** directly into the Figma design process — not as a post-design compliance checker, but as a generative, design-time tool.

It works in two parts:

- **Part 1 — Variable Remapping**: Audit a component's color variables, calculate their Lc contrast values, identify failures, and propose or apply compliant replacements
- **Part 2 — Component Iterator**: Generate a range of component variations at user-specified Lc targets, covering light mode, dark mode, or both

---

## What is APCA?

APCA (Advanced Perceptual Contrast Algorithm) is the contrast method developed for WCAG 3.0. Unlike WCAG 2.x, it is:

- **Polarity-aware** — correctly handles dark mode (light text on dark backgrounds), where WCAG 2.x fails
- **Perceptually uniform** — contrast values map to how humans actually see text, not raw luminance ratios
- **Use-case aware** — different Lc thresholds apply depending on font size, weight, and reading context

### Lc Level Reference

| Lc Level | Use Case |
|---|---|
| Lc 15 | Minimum for non-text elements (dividers, borders, focus outlines) |
| Lc 30 | Minimum for any text — placeholder and disabled states only |
| Lc 45 | Minimum for large/heavy text (headings ≥ 36px/400w or 24px/700w) |
| Lc 60 | Minimum for UI labels and captions (≥ 24px/400w or 16px/700w) |
| Lc 75 | Minimum for body text columns (≥ 18px/400w) |
| Lc 90 | Preferred for fluent reading — also the **dark mode maximum** (above this causes halation) |

> WCAG 2.x approximations (light mode only): Lc 60 ≈ 3:1 · Lc 75 ≈ 4.5:1 · Lc 90 ≈ 7:1. APCA and WCAG 2.x diverge significantly for dark mode — do not use WCAG 2.x to evaluate dark mode contrast.

---

## What It Does

### Part 1 — Variable Remapping

1. Reads all color variables from the selected component via `get_variable_defs` + `get_design_context`
2. Infers color roles (text, background, icon, border) from variable names and layer structure
3. Builds contrast pairs and calculates current Lc values for each
4. Identifies failures against your target threshold
5. Proposes replacement colors that meet or exceed the target — staying within the same hue family
6. Applies approved changes directly to Figma variables via `use_figma` Plugin API
7. Verifies the write succeeded by recalculating Lc values post-update

**Example audit output:**
```
Variable Pair                    Current Lc   Target Lc   Status
────────────────────────────────────────────────────────────────
color/label on color/btn-bg        Lc 41        Lc 60      ❌ Fails
color/title on color/surface       Lc 78        Lc 75      ✅ Passes
color/caption on color/card        Lc 52        Lc 60      ❌ Fails
```

### Part 2 — Component Iterator

1. Reads the component structure and current variable values
2. Calculates a contrast matrix across all variants (Primary, Secondary, Disabled, etc.)
3. Generates three variations per target — minimal compliance, comfortable, and high contrast
4. Writes variations to Figma as new variable modes or new component variants on canvas
5. Presents a visual comparison with Lc values labeled for quick review

**Example variation output:**
```
Variation A — Lc 47 (Minimal Compliance)
Variation B — Lc 62 (Comfortable)
Variation C — Lc 78 (High Contrast)
```

---

## Prerequisites

- A Figma file open with a component selected
- The **Figma MCP server** connected to Claude (see below)
- A Figma personal access token — get one from **Figma → Account Settings → Personal Access Tokens**

> This skill uses the **Figma MCP server**, not a Figma plugin. Claude reads and writes directly to your Figma file through the MCP connection — no plugin panel or Figma Community install required.

---

## Connecting the Figma MCP Server

### Using Claude.ai (browser)

1. Go to **Claude.ai → Settings → Integrations**
2. Find Figma and click **Connect**
3. Authorize with your Figma account
4. The Figma MCP server will be available in all your Claude conversations

### Using Claude Code (terminal)

Add the Figma MCP server to your Claude config file (`~/.claude.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_FIGMA_ACCESS_TOKEN"
      }
    }
  }
}
```

Replace `YOUR_FIGMA_ACCESS_TOKEN` with your personal access token. Store it in `.component-contracts` (gitignored) and reference it from there — never hardcode it in the config directly.

---

## Installation

1. **Clone the repo**

```bash
git clone https://github.com/your-username/figma-apca-accessibility.git
cd figma-apca-accessibility
```

2. **Store your Figma access token**

Create a `.component-contracts` file in the root (gitignored — never commit this):

```
FIGMA_ACCESS_TOKEN=your_token_here
```

3. **Add the skill to Claude**

Place the `SKILL.md` file in your Claude skills directory:

```
/mnt/skills/public/figma-apca-accessibility/SKILL.md
```

---

## How to Trigger It

Use any of these prompts in Claude with a Figma component selected:

**Part 1 — Audit and remap variables:**
> "Audit the color variables in this component for APCA compliance. My button labels need to be at least Lc 60."

> "My success surface is #14ae5c and nothing passes against it. Give me my options."

> "My button label must stay white. Find me a dark mode background that hits at least Lc 60 against white, staying in the same blue family."

**Part 2 — Generate variations:**
> "Using the current light mode button variables, create a dark mode version where button labels are at least Lc 45. Generate three variations so I can compare."

**Combined flow:**
> "First remap my existing variables to Lc 75 for body text. Then generate three dark mode variants of this card at Lc 45, Lc 60, and Lc 75."

---

## Edge Cases This Skill Handles

### Mid-Luminance Surface Trap
When a background sits in the middle luminance range (roughly Y 0.15–0.40), neither black nor white text can achieve the target Lc. Common culprits: mid-tone greens, yellows, reds, and oranges used as semantic status colors.

The skill detects these automatically and presents three resolution options — it never auto-applies a fix without your review.

### Dark Mode Halation
When Lc exceeds 90 in dark mode (e.g., pure white on near-black), the glow effect reduces readability despite the high contrast number. The skill detects halation and recommends raising the dark background slightly — not graying out the text.

### Disabled / Placeholder States
These are intentionally kept at Lc 30 maximum to signal inactivity. The skill does not force disabled states to body-text contrast levels.

---

## Licensing Notice

APCA is developed by Myndex Research / Accessible Reading Technologies (ART). This skill implements the APCA-W3 0.0.98G algorithm under the W3C open license for design tooling.

- Does **not** claim "APCA Compliant" certification (which requires formal evaluation by Myndex/ART)
- Does **not** use WCAG 2.x contrast ratios — APCA Lc values are not interchangeable with WCAG 2.x ratios
- Is **prohibited** for use in medical, clinical, aerospace, transportation, automotive, or military applications without a specific written license from Myndex Research

For more information: https://git.apcacontrast.com/documentation/WhyAPCA  
Reference implementation: `npm i apca-w3`

---

## Contributing

Contributions are welcome. Here's how to get started:

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-improvement`
3. Make your changes to `SKILL.md`
4. Test against at least two component types — one light mode, one dark mode
5. Open a pull request with a clear description of what changed and why

### Guidelines

- Keep the two-part structure intact — Variable Remapping and Component Iterator are distinct workflows
- Any new Lc threshold rules must cite the APCA-W3 specification or Myndex documentation
- Do not commit `.component-contracts`, `scripts/`, or any generated artifacts
- Edge case handling (mid-luminance traps, halation, disabled states) must always present options to the user — never auto-apply

---

## License

MIT
