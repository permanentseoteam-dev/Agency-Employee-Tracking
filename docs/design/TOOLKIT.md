# Design toolkit (Claude Code skills and MCP)

Installed for the UI redesign. Everything is project-scoped: skills live in `.claude/skills/`, the MCP server in `.mcp.json`. Claude Code loads them in a new session. The first time, it asks you to approve the `shadcn` MCP server.

Each skill was read before install. Each folder keeps its upstream `LICENSE`.

| Skill (folder) | Source | Use |
|---|---|---|
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) 4.5.2, Apache-2.0 | Anti-slop design commands: `/impeccable init`, `shape`, `critique`, `audit`, `polish`, `harden`, `typeset`, `animate`. Installed **as a skill only**, without the plugin's automatic hooks, which run its engine on every edit and at session start and stop. On first use it downloads its engine (checksum-verified) from the project's GitHub releases into `~/.impeccable`. |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 2.15.0, MIT | Local design database (styles, palettes, font pairs, UX rules, React and shadcn guidance) searched with `python …/scripts/search.py`. No network. Script paths were changed from `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/` to `${CLAUDE_SKILL_DIR}/` so it works as a project skill. |
| `minimalist-ui`, `redesign-existing-projects`, `full-output-enforcement` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), MIT | The product-UI members of the Taste suite. The default taste skill targets landing pages, so it is not installed. |
| `emil-design-eng`, `animate`, `animation-performance`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `ask-sonner`, `break-ui`, `prototype`, `pick-ui-library` | [emilkowalski/skills](https://github.com/emilkowalski/skills), MIT | Motion and polish rules for product UI. `review-animations`, `prototype` and `pick-ui-library` run only when called by name. |
| `gsap-framer-scroll-animation` | [github/awesome-copilot](https://github.com/github/awesome-copilot), MIT | Motion v12 and scroll animation, including smooth scrolling. In this app, smooth scrolling (Lenis) is used only on long reading pages, never on tables. |

**MCP:** `shadcn` (`cmd /c npx -y shadcn@latest mcp`) browses the shadcn and Animate UI registries. It needs `components.json`, which `shadcn init` adds in the foundation phase along with the `@animate-ui` registry.

**References:** `docs/design/references/` holds `DESIGN.md` files from [rohitg00/awesome-claude-design](https://github.com/rohitg00/awesome-claude-design) (MIT): `mercury-x-linear.md` (closest to our "calm and precise" direction), `linear.md`, `vercel.md`, and the `break-default-aesthetic.md` anti-slop prompt. We borrow their structure, not their brands.

## Not installed (and how to add them later)
- **21st.dev Magic** (needs a free key from 21st.dev/mcp): `claude plugin marketplace add 21st-dev/magic-mcp --scope project`, then install `21st`, and set `API_KEY_21ST`.
- **Google Stitch skills** (need the Stitch MCP and a Google account): `npx plugins add google-labs-code/stitch-skills --scope project --target claude-code`, then follow stitch.withgoogle.com/docs/mcp/setup.
- **Framer**: a website builder, not used in the desktop app. Its skill is available in Claude Code; set it up with `npx @framer/agent@latest setup` if we build a marketing site.
