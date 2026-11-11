---
name: reverse-design
description: Reconstruct source-backed requirements, architecture, data, interaction, and decision documents for a pull request, branch, codebase, or selected code.
metadata:
  version: "0.1.0"
---

# Reverse Design

Turn selected code into the documents a reviewer needs to understand its behavior,
architecture, and limits. Use the installed Code Unpacked suite's shared
[core](../code-unpacked-core/SKILL.md) for source capture, target selection, output
paths, and comment delivery. Invoke this skill independently of the other artifact
skills.

## Targets

- `$reverse-design pr https://github.com/owner/repo/pull/123`
- `$reverse-design pr 123 --repo owner/repo`
- `$reverse-design branch feature-name --base main`
- `$reverse-design codebase`
- `$reverse-design docs authentication --files src/auth.ts:20-90,src/login.ts`

For code selected in chat, use a named `docs` target and preserve the supplied text
as source evidence. A PR or branch describes the resulting design and explains the
change relative to its base. A codebase or docs target describes the captured
snapshot.

## Generate the document bundle

1. Capture and validate context through the core. Prefer available graph tools for
   structural discovery; verify relevant coverage and read source when coverage is
   missing. Do not claim graph evidence when unavailable.
2. Inspect changed code and enough surrounding source to establish the behavior.
   Write content matching [the schema](references/content.schema.json). Cite the
   context's evidence IDs for every section, diagram, and generated family.
3. Account for all eleven document families in `coverage`. Generate the relevant
   ones; give a concrete reason for `not-applicable` or `insufficient-evidence`.
4. Render the validated content with:

   ```text
   node <skill-dir>/scripts/reverse-design.mjs render --context <context.json> --content <design-content.json> --root <target-root>
   ```

5. Open `index.html` and inspect diagrams. The renderer writes the bundle under
   `.code-unpacked/pr/<number>/reverse-design/`,
   `.code-unpacked/branch/<safe-name>/reverse-design/`, or
   `.code-unpacked/docs/<name>/reverse-design/`. Whole-codebase output uses
   `docs/codebase`.

The LLM authors explanations and Mermaid; scripts validate citations, document
coverage, filenames and content, render diagrams and HTML, and prepare the manifest
and PR comment. Node and the suite dependencies are required. Diagrams additionally
need Playwright Chromium; use the suite's browser installation instructions.

## Choose relevant documents

| Family ID | Evidence that makes it useful |
| --- | --- |
| `requirements` | Observable behavior and constraints. Always generate a concise overview, including explicit unknowns. |
| `stories` | Identifiable users and outcomes support stories with observable acceptance criteria. |
| `user-flows` | An interaction has meaningful steps, branches, or failure paths. |
| `c4` | Code establishes system, service, runtime, or component boundaries. Use only the C4 levels supported by evidence. |
| `data-model` | Explicit entities, persistence, fields, or relationships support an ERD or data model. |
| `sequences` | A traceable interaction or call sequence explains behavior. |
| `state-machines` | Explicit states and transitions exist. |
| `api-contracts` | Exposed interfaces have observable inputs, outputs, or errors. Record unknown fields rather than inventing guarantees. |
| `deployment` | Runtime or deployment configuration establishes topology. |
| `threat-model` | Trust boundaries, sensitive data, or privileged operations support concrete risks. |
| `decisions` | Existing ADRs record decisions, or the implementation supports a clearly labeled reconstructed decision note. |

## Keep evidence and interpretation distinct

Every section uses `basis: observed`, `inferred`, or `proposed`. Observed statements
describe source-supported behavior; inferred statements reconstruct possible intent;
proposed statements suggest future changes. Do not present inferred requirements as
stakeholder-approved requirements or proposed mitigations as existing controls.

Decision documents without a cited historical ADR must include **Reconstructed** in
their title. State that the original rationale is unknown. Mark reconstructed
rationale inferred, and mark alternative future decisions proposed. Existing code
alone does not establish the author's historical reasoning.

For API contracts, distinguish reconstructed behavior from a published contract.
Preserve unknown request fields, validation rules, response variants, and deployment
details as open questions. Avoid generating a falsely authoritative OpenAPI document
from incomplete evidence.

Markdown supports paragraphs, headings, lists, inline code, fenced code, tables,
bold text, and ordinary links. Raw HTML is displayed as text. Mermaid uses strict
rendering; omit click actions, initialization directives, executable markup, and
external resource references.

## Outputs and delivery

The bundle contains `index.html`, `design.json`, one Markdown file per document,
Mermaid `.mmd` and rendered `.svg` files for diagrams, `manifest.json`, and
`comment.md`. The HTML contains its styling and diagrams and works offline.

For PRs, `comment.md` includes the documents and Mermaid directly, plus the HTML
attachment checklist. Follow core delivery handling: prepare a draft unless posting
was requested. Never insert nonexistent hosted links. If the user authorized actual
posting, attach/share artifacts through a supported delivery route before posting
the final comment.

## Verification

Run `node --test skills/reverse-design/tests/reverse-design.test.mjs` from the suite
root. Tests cover evidence and applicability validation, safe Markdown, deterministic
artifacts, offline browser navigation, Mermaid validation, and inline PR documents.
