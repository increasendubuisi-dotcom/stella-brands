# 01 · Reference research

Researched 7 Nov 2026 from the public sites of Joisti (joisti.com) and Standards (standards.site, standards.site/ai).

**Method and limits.** I rendered the public marketing pages, pricing pages, published example guides and the Standards AI page in a headless browser. Both products keep their **editors behind sign-in**, and Standards' help centre (help.standards.site) was not reachable from this environment. So anything below about editor internals is marked *inferred*. I did not create accounts on either service. If you want a hands-on teardown of their editors, the best route is for you to sign up for their free or trial tiers and share screen recordings.

---

## Joisti — "Brand guidelines, made easy"

**Positioning.** Independent designers and small studios. "Fill in, don't build." There are 110+ published guides.

| Area | What the site shows |
|---|---|
| Start | "Start with what you have. A logo or a website is enough. Joisti reads the colors and makes the first card." You can drop logos, fonts and pictures (up to 10 MB each) or enter a website URL. |
| Templates / editing | "Every section is already designed. Write into it, drop your assets in, and it always looks right." It is an opinionated, fixed-design template. Free includes "every section and template". |
| Published guide | Lives at `joisti.com/{brand}`. It has a left sidebar with a two-level outline (Introduction, Strategy, Logo, Color, Typography, Motion, Layout, Photography, Applications, Illustration, Iconography, Language, Resources) plus search and an "Updated <date>" stamp. Section pages open with a full-bleed colour hero and a big heading, then a two-column layout with the subsection title on the left and copy on the right. |
| Colour | The Gleam guide shows HEX/RGB/CMYK toggles, **copy** buttons, colour **proportion** bars (e.g. Paper 44%), **combinations** ("Toffee on Custard") and **misuse** and **colour modes** subsections. This is strong, opinionated colour documentation. |
| Sharing | One link, open or password-protected. "Everyone sees what you change": the live guide is always current. |
| AI | "Claude, ChatGPT and Cursor read the guide directly" through **MCP** ("or any AI tool that supports MCP"). AI can "help you fill the guide in". Free includes "one AI first draft". |
| Handover | Pro: "send a handover from the guide's settings, your client takes the brand over with one click", including files and live page. |
| Export | Pro: whole guide as a 16:9 PDF, plus every page as an editable Illustrator file. |
| Pricing | Free: 1 live guide, 1 draft brand, badge. Pro: $8/mo billed annually, with unlimited brands, custom domain, no badge and export. Cancelling never takes guides down. |

**Strengths**
- Very low effort to a good-looking result, because the design is pre-solved.
- The logo/URL-first onboarding gives instant value: colours are extracted into a first card.
- The colour documentation is deeper than most (proportion, combinations, modes).
- AI access through MCP is built in. Guides are treated as AI context, not just web pages.
- Generous, humane plan policies (guides stay live), and handover is a first-class feature.

**Gaps and opportunities (observed or inferred)**
- *Inferred:* limited layout and creative control. "It always looks right" usually means you can't make it look different, and every guide shares the same chrome.
- No visible strategy or discovery tooling. AI fills the guide in but does not *develop* the strategy.
- No visible client commenting or feedback workflow, and no visible versioning or "publish when ready". Changes appear live ("Everyone sees what you change").
- No visible brand-specific presentation themes.

---

## Standards — "Static guidelines are outdated"

**Positioning.** Design-led organisations and agencies (examples include McLaren F1, Mailchimp, Cash App, Obama Foundation, MLB, Herman Miller). It positions itself as "the most sophisticated design controls of any online brand site design tool."

| Area | What the site shows |
|---|---|
| Editing | "Precise settings and a familiar, intuitive interface." Flexible outlines. *Inferred:* a canvas-style editor that is closer to a design tool. |
| Responsive | "Three distinct breakpoints that allow design optimization for any screen", with per-breakpoint type sizes and **per-breakpoint navigation**. |
| Navigation | "Persistent and customizable menus", with types "ranging from sidebars to flyouts". |
| Typography | Custom font upload rendered as live text. Supports variable fonts, OpenType features, type specimens, character sets and **type testers**, plus baseline and x-height visualisation. **Text styles**: change one style and it updates site-wide. |
| Media | Native video, third-party embeds and **audio players** (sonic branding). |
| Versioning | "Publish the first live version of your guideline while working on the next iteration… then publish when ready." Enterprise adds automatic backups and version history. |
| Collaboration | Real-time multi-editor editing. Comments with tagging, threads and email notifications. |
| Access | Password-restricted pages, custom domains, domain-verified access ("grant or revoke access… by adding and removing their email domain"), viewer SSO, viewer logs. |
| Localisation | Auto or custom translation (Enterprise). |
| Handover | "Transfer to clients", with clients then owning billing. |
| Pricing | Pro from $40/mo with 2 seats (additional seats from $20/mo), 2 GB per site, unlimited published sites. Enterprise is custom. |

**Standards AI (standards.site/ai)**
- Two faces of one document: **standards.site** ("guidelines for humans", meaning immersive and visual) and **standards.md** ("guidelines for agents", meaning structured, machine-readable, actionable).
- Flow: *Design → Structure → Connect.* The guidelines are "automatically structured" into an agent-ready format.
- Delivery: `standards.md`, **MCP** (Pro/agencies) and a secure **API** (Enterprise).
- Covers logo, colour, typography, motion and voice. Use cases include support bots, sales emails, onboarding and automated compliance checks.
- Security: access scoped by project, page, files or styles; OAuth 2.0; role-based rules for "internal teams and agents"; automatic versioning; SSO.

**Strengths**
- Real typographic depth and media richness, with true responsive control.
- Draft-versus-published separation, collaboration and commenting.
- Enterprise-grade access control and a clear story for agents.

**Gaps and opportunities**
- Expensive for independent designers in emerging markets ($40/mo plus $20 per seat).
- *Inferred:* a steeper learning curve, since the power comes from design-tool-style controls.
- No visible strategy development. It assumes the brand strategy already exists.
- No client-revision workflow visible beyond comments. No invoicing or business tooling.

---

## Synthesis: where we win

| | Joisti | Standards | **Our product** |
|---|---|---|---|
| Time to first guide | Excellent | Moderate | **Excellent**: logo/URL-first start, templates as data |
| Creative control | Low | Very high | **High but staged**: smart defaults, with depth revealed progressively |
| Strategy development | – | – | **Core differentiator**: an AI Strategist that runs discovery and writes approved strategy into the guide |
| Machine-readable output | MCP | standards.md, MCP, API | **brand.md and brand.json from day one**; MCP in Phase 2 |
| Brand-specific presentation | – | Manual, via controls | **Presentation themes**, with AI-recommended direction |
| Client feedback loop | – | Comments | **Section comments, revision requests and a triage inbox** |
| Draft and publish | Live edits | Yes | **Immutable published snapshots from Phase 1** |
| Price point | $8/mo | $40/mo | **₦5k–₦15k/mo** (configurable), local payments through Paystack |
| Business tooling | Handover | Handover | Handover, then invoicing |

**Principles carried forward**
1. *From Joisti:* start from what the designer already has, keep sections designed by default, keep it humane.
2. *From Standards:* text styles and tokens as single sources of truth, explicit publishing, and one document with two interfaces (human and agent).
3. *Our own:* strategy before style. The guide is the *output* of a thinking process we help run, not just a container.
