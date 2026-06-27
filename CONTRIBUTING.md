# Contributing to apca-compliance-figma

Thanks for considering a contribution to `apca-compliance-figma`! This project integrates the Advanced Perceptual Contrast Algorithm (APCA) directly into Figma design workflows.

Most contributions fall into one of these buckets:
1. **Improving the Skill Prose & Prompts** — refining how the agent interacts with Figma, handles variable audits, or formats its responses.
2. **Adding Reference Implementations** — expanding helper scripts, calculations, or integrations with Figma MCP/console features.
3. **Enhancing Edge-Case Rules** — updating strategies for complex edge cases like mid-luminance traps or dark mode halation.

We prefer small, focused pull requests.

---

## Quick Orientation

The repository is structured as a single-skill workspace:

- [SKILL.md](SKILL.md): The core system prompt/instructions for the AI agent. This contains the APCA algorithm reference, variable remapping procedures, component iteration rules, and edge-case guides.
- [README.md](README.md): User-facing documentation on what the skill is, how to install it, and how to connect the Figma MCP server.
- [package.json](package.json): Defines dependencies (such as the reference `apca-w3` library) and testing scripts.
- [tests/](tests/): Unit tests verifying the reference APCA algorithm implementation and edge-case helpers.

---

## Core Guidelines for SKILL.md Edits

If you are editing [SKILL.md](SKILL.md), please adhere to the following principles:

### 1. Maintain APCA Mathematical Integrity
- Do not modify the `APCAcontrast` or `sRGBtoY` JavaScript implementation unless correcting a divergence from the official W3 reference version (`apca-w3` 0.0.98G-4g).
- Contrast values are signed: normal polarity (dark text on light BG) is positive; reverse polarity (light text on dark BG) is negative. Ensure all guidance handles these signs correctly.

### 2. Follow Role Inference Rules
Ensure the agent continues to infer variable roles logically based on names (e.g. `text`, `bg`, `icon`, `border`) and layer structure, and requests clarification if the pairing or intent is ambiguous.

### 3. Handle Edge Cases Collaboratively
- **Mid-Luminance Surface Traps**: When a background color is in the middle of the luminance range (Y 0.15–0.40), no text color adjustment (black or white) can satisfy the target Lc contrast. In these cases, the agent **must not auto-apply changes**. It should flag the trap and present the three standard options:
  1. Darken the surface color.
  2. Lower target Lc + increase font weight/size.
  3. Swap text polarity (e.g. dark text on neutral card).
- **Dark Mode Halation**: Lc values beyond `-90` in dark mode cause visual glow (halation). The agent must recommend softening the background slightly (raising background luminance), not graying out the text. This is a product-level decision and requires user confirmation.

---

## Running Tests

Before submitting a PR, make sure all tests pass:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run tests**:
   ```bash
   npm test
   ```

Tests are run using Node's built-in test runner (`node --test`), which validates the algorithm's output, polarity handling, mid-luminance trap logic, and halation checks.

---

## Pull Request Guidelines

- **Use Conventional Commits**: Ensure your commit message subjects follow the Conventional Commits specification (e.g., `feat(skill): add support for border thickness rules` or `docs(readme): correct installation paths`).
- **One Concern per PR**: Keep pull requests focused. Do not mix documentation typo fixes with algorithm modifications.
- **Show Before/After**: When changing prompts or prose in `SKILL.md`, provide a brief explanation of why the new phrasing is more effective or token-efficient.
- **Test Your Changes**: Verify that your skill changes behave correctly on actual Figma layers (e.g., test on at least one light-mode and one dark-mode component before submitting).
