# Reverse Design

Turn selected code into the documents a reviewer needs to understand its behavior,
architecture, and limits. Use the installed Code Unpacked suite's shared
[core](../../../runtime/guide.md) for source capture, target selection, output
paths, and comment delivery. Invoke this skill independently of the other artifact
skills.

## Targets

- `/reverse-design pr https://github.com/owner/repo/pull/123`
- `/reverse-design pr 123 --repo owner/repo`
- `/reverse-design branch feature-name --base main`
- `/reverse-design codebase`
- `/reverse-design docs authentication --files src/auth.ts:20-90,src/login.ts`

For code selected in chat, use a named `docs` target and preserve the supplied text
as source evidence. A PR or branch describes the resulting design and explains the
change relative to its base. A codebase or docs target describes the captured
snapshot.

## Generate the document bundle

1. Capture and validate context through the core. Prefer available graph tools for
   structural discovery; verify relevant coverage and read source when coverage is
   missing. Do not claim graph evidence when unavailable.
2. Inspect changed code and enough surrounding source to establish the behavior.
   Write content matching [the schema](content.schema.json). Cite the
   context's evidence IDs for every claim, section, and diagram. Reuse shared
   [review analysis](../../../runtime/references/analysis.md) when available;
   add relevant unchanged callers, guards, and tests before drawing conclusions.
3. Select documents that answer useful questions about this change. Start with a
   concise purpose, review focus, and extension context. No document family is
   mandatory. Optional `coverage` records only the applicability decisions worth
   preserving; do not manufacture an exhaustive checklist.
4. Render the validated content with:

   ```text
   node <skill-dir>/scripts/reverse-design.mjs render --context <context.json> --content <design-content.json> --root <target-root>
   ```

5. Open `index.html` and inspect diagrams. The renderer writes the bundle under
   `.code-unpacked/pr/<number>/reverse-design/`,
   `.code-unpacked/branch/<safe-name>/reverse-design/`, or
   `.code-unpacked/docs/<name>/reverse-design/`. Whole-codebase output uses
   `docs/codebase`.

The LLM authors explanations and Mermaid; scripts validate citations, optional
applicability metadata, filenames and content, render diagrams and HTML, and prepare the manifest
and PR comment. Node and the suite dependencies are required. Diagrams additionally
need Playwright Chromium; let the bundled runtime set up its browser on first use.

## Choose relevant documents

| Family ID | Evidence that makes it useful |
| --- | --- |
| `requirements` | Product behavior and constraints need a requirements document beyond the concise overview. |
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

These are suggestions, not required categories. Use a custom kebab-case `family`
when another document is more useful. A tiny change may need only the overview.
Avoid padding the bundle with documents that repeat the same facts.

## Author the explanation

New content uses `schemaVersion: 2`, `title`, `overview`, and selected `documents`.
The overview has `purpose`, `reviewFocus`, and `extensionContext`; each entry is a
claim with `markdown`, `basis`, and source `evidence`. Purpose is one claim; the
other fields are nonempty arrays of claims. Explain what the code does, the order
in which to review it, and which seam to change when extending it. Keep these
claims short enough to scan before opening a document.

Put the most useful diagrams first by ordering their documents and diagrams.
Every v2 diagram includes the specific `question` it answers. Prefer separate
sequence diagrams for distinct flows, such as success, authorization failure, and
retry; do not force all behavior into one large interaction. Questions must be
distinct. A diagram-only document may have `sections: []`.

When shared analysis exists, use `topicIds` and `flowIds` on documents and `flowId`
on diagrams to link them to its topics and flows. These optional IDs are validated
against `context.analysis`. Keep inferred relationships labeled in the surrounding
explanation, and do not present a graph edge as a runtime guarantee.

Schema 1 content with `summary` and `summaryEvidence` remains supported. Its summary
becomes the concise purpose; shared review focus and extension points are reused
when available. Legacy coverage tables remain available in collapsed metadata.

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

The overview and question-led diagrams appear first. Detailed explanations,
diagram sources, applicability metadata, and coverage limitations are expandable.
The HTML does not require a network connection or a live diagram service.

For PRs, `comment.md` leads with the overview and key Mermaid diagrams, then places
detailed documents and applicability metadata in expandable sections, plus the HTML
attachment checklist. Follow core delivery handling: prepare a draft unless posting
was requested. Never insert nonexistent hosted links. If the user authorized actual
posting, attach/share artifacts through a supported delivery route before posting
the final comment.

## Verification

Installed bundles omit development tests. Inspect the generated HTML offline as
described above. Run `node --test tests/skills/reverse-design/reverse-design.test.mjs`
from the development checkout. Tests cover selected-document and evidence validation, schema 1 compatibility,
safe Markdown, overview ordering, collapsed detail, offline browser navigation,
focused Mermaid questions, shared browser use, and inline PR documents.
