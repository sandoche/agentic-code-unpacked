# Code Unpacked homepage content draft

Content proposal for engineers authoring or reviewing AI-written PRs. The homepage copy comes first; the editorial notes cover future examples, research, and illustration ideas. No visual design is specified here.

## Homepage copy

### Stop pretending you understand that PR

Your agent wrote it. Or a teammate asked you to review it. The tests pass, but you're still piecing together how it works.

Code Unpacked helps you follow the change, check your understanding, and ask better questions before it ships.

Free, open-source skills for your coding agent. MIT licensed. No separate account.

[Install the skills](#bring-a-pr-you-need-to-understand) · [Explore an example](#one-pr-five-ways-to-understand-it) · [View on GitHub](https://github.com/sandoche/agentic-code-unpacked)

### The diff tells you what changed. You still need the context

You can read every added line and still struggle to explain the whole change.

- **Where do I start?** The PR touches six files. The important bit is somewhere between them.
- **What happens when it fails?** The happy path makes sense. The retry, rollback, and edge cases take more digging.
- **How would I change this next week?** You need to know which assumptions the next feature could break.

If you can't explain this change, where would you start when the next feature touches it?

### Get an explanation you can check

Give your agent a PR, branch, repository, or selected code. Code Unpacked helps it turn the source into explanations with references you can follow back to the code.

Your agent runs the workflow. The outputs are local files you can open offline, with no separate Code Unpacked cloud service.

Before requesting review, get familiar with what your agent built. When reviewing someone else's PR, find a useful starting point and work through the details.

Choose the format that answers your question. You still make the review call.

### One PR. Five ways to understand it

**Illustrative PR: prevent duplicate webhook deliveries from creating duplicate orders.** These examples describe the same fictional change, so you can compare the formats.

#### Walkthrough: know where to start

Follow the change in a useful reading order, with focused code excerpts along the way.

“Start at the webhook handler. Follow the event ID into the order transaction. Then check what happens when that ID arrives again.”

**Step through the change** · `/walkthrough`

#### Reverse design: see how it fits

Turn the implementation into architecture and behavior documents, with diagrams where they help.

“The event marker and order are saved in one transaction. If it rolls back, neither remains. A retry can try again.”

**Explore the design** · `/reverse-design`

#### Code map: follow the connections

Explore files, functions, and their relationships without losing the bigger picture.

“Webhook handler → create order once → database transaction. Open a function to inspect its source and connections.”

**Follow the flow** · `/code-map`

#### Review quiz: find the gaps

Try questions about behavior and failure cases. Each answer comes with an explanation and source references.

“Two copies of the same event arrive together. What actually prevents a second order?”

**Try a question** · `/review-quiz`

#### Comics: make the tricky bit stick

Explain a behavior through a short, original stick-figure comic, with a source-backed transcript.

“I checked. That event hasn't been processed.” “So did I.” The database gets the deciding vote.

**Read the comic** · `/xkcd`

#### Want the whole picture?

Use `/code-unpacked` to generate all five formats from one source snapshot and shared analysis. Pick an individual skill when you only need one format.

**See the complete bundle** · `/code-unpacked`

### Understanding the code is part of the work

In a field study of 78 professional developers across seven projects, program comprehension accounted for about 58% of working time. That covered development and maintenance activities, beyond PR review. [Read the study](https://xin-xia.github.io/publication/TSE17.pdf).

Research at Microsoft also identified understanding code and changes as central to code review. [Read the research](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/).

Getting code written and getting familiar with it are separate pieces of the job.

### Bring a PR you need to understand

Run this from your project and choose the skills and coding agents you use:

```sh
npx skills add sandoche/agentic-code-unpacked
```

Start a new agent session, then try a walkthrough with your PR URL:

```text
/walkthrough pr https://github.com/owner/repo/pull/123 --draft
```

`--draft` keeps the generated files and prepared comment local. Open the HTML in your browser.

Works with Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode, and other supported skills CLI agents. Requires Node.js 22.23.4+ with npm. In Codex, use `$walkthrough`; you can also ask your agent in plain language.

[Read the usage guide](usage.md).

### Frequently asked questions

#### What is a skill, and where do I use it?

A skill gives your coding agent instructions and tools for a task. Install it, then invoke it in the agent you already use.

#### Does this work on human-written code too?

Yes. Use it on a PR, branch, whole repository, selected files, or pasted code, whoever wrote it.

#### How is this different from asking for a PR summary?

A summary gives you an overview. These skills produce artifacts you can work through: a reading order, design documents, an explorable map, questions, or comics.

#### Can the explanations be wrong?

Yes. They're generated by your agent. Use the source references to check important claims. Inferred intent and missing evidence should be identified in the output.

#### Does passing the quiz mean the PR is safe to merge?

No. It checks your understanding of the explained code. You still need to assess correctness, tests, security, and whether the change solves the problem.

#### Where does my code go? Does anything get posted?

Your agent's configured providers and data-handling rules apply. Artifacts save under `.code-unpacked/`. Posting to a PR requires an explicit request and authenticated access; `--draft` stays local.

#### Does it need a cloud service? Can it work offline?

Code Unpacked runs through your existing agent, without its own hosted service. First use downloads rendering tools. Generation can work offline with local source, cached tools, and a local model if your agent supports one. Opening the finished HTML needs no connection.

#### Is it free for commercial use?

Yes. The software is free, open source, and [MIT licensed](../LICENSE). Your coding agent, model provider, or image-generation service may charge for usage.

#### Do I need all five formats?

No. Install an individual skill or install `code-unpacked` for the complete bundle. The bundle includes the five formats; separate installations aren't required.

#### What else do I need for video or comics?

Video is optional and needs FFmpeg. Comics need an available image-generation tool. Without one, the comic workflow saves its storyboard and prompts for later.

### Understand the change. Then make the call

Start with the PR you're about to write “looks good” on.

[Install the skills](#bring-a-pr-you-need-to-understand) · [View on GitHub](https://github.com/sandoche/agentic-code-unpacked) · [Read the usage guide](usage.md)

## Editorial notes

Everything below supports future implementation. It is not homepage copy.

### Audience, hierarchy, and voice

Speak to engineers who want to understand what they ship: the author checking an agent's work and the reviewer arriving without its context. Assume they intend to review and maintain the code. Automatic approval and unattended merging are outside this page's promise.

The opening acknowledges a familiar gap without blaming the reader for using AI. Keep “vibe-coded PR” for occasional supporting language; avoid repeating it as a label for the audience.

Make the existing-agent workflow a clear reason to try it: no separate Code Unpacked account or cloud service, and local artifacts. Avoid “zero dependencies,” “your code never leaves your machine,” or unconditional offline-generation claims. Setup downloads tools; source retrieval, model calls, image generation, and optional delivery depend on the user's agent and providers. Offline viewing and offline generation are different promises.

The reader's route is: recognize the situation → understand the help → compare examples → see supporting evidence → try a skill → resolve practical questions. Keep examples ahead of research so the page shows the product before asking readers to consider studies.

For the future page, use the hero as the single H1, the other homepage sections as H2s, and the format and FAQ headings as H3s. The extra heading level in this file separates draft copy from editorial material.

### Calls to action and destinations

| Label | Destination or behavior |
| --- | --- |
| Install the skills | Jump to “Bring a PR you need to understand”; offer the install command for copying. |
| Explore an example | Jump to “One PR. Five ways to understand it.” |
| Five format actions | Open the corresponding prepared demonstration described below. |
| See the complete bundle | Let readers move between the five prepared outputs for the same example. |
| View on GitHub | Open the project repository. |
| Read the usage guide | Open `docs/usage.md` in the repository until a website documentation route exists. |

The demonstration action labels are copy proposals, not live controls in this Markdown. They should explore prepared content on the future homepage; they do not submit a visitor's repository or start generation. Reuse these labels for the implemented actions.

Keep the existing relative documentation and license links when reading this file on GitHub. Resolve them to real destinations when publishing the future page.

### Shared example and interaction briefs

These are proposed demonstrations, not existing output, testimonials, or a real PR. Before publishing them, create a small working fixture, generate artifacts from it, and replace the illustrative passages with inspected output and real source references. Keep the example label visible.

Use these same facts in every format:

- A webhook contains a provider name and event ID. The pair identifies a delivery event.
- The fictional `handleWebhook` calls `createOrderOnce`.
- One database transaction records the event marker and creates its order. A uniqueness constraint on the provider/event-ID pair prevents two committed copies.
- A duplicate after a successful commit returns the existing order without creating another. Concurrent copies rely on the database constraint; a prior read alone is insufficient.
- A failed transaction rolls back both records, allowing a later delivery to retry. Separate effects such as email and payment calls are outside this fixture.

Do not present this example as a general guarantee about webhook processing. Its behavior depends on the fixture's transaction and uniqueness constraint.

#### Walkthrough interaction

Offer three steps: **Receive the event**, **Save the order**, and **Handle another delivery**. Selecting a step reveals its focused source excerpt and explanation. The last step says: “A repeated event returns the order already created. If the first transaction failed, it left no event marker, so a retry can proceed.”

Keep **Next step** and **Back to source** as the action copy. Source references must point to the actual fixture revision when available.

#### Reverse-design interaction

Let the reader choose **First delivery**, **Duplicate delivery**, or **Failed transaction**. Reveal the relevant behavior description and corresponding part of the flow.

For failure, use: “Order creation fails. The transaction rolls back the event marker too. A later retry is allowed to attempt creation again.” Label the transaction behavior as observed once verified. Label any rationale reconstructed from the code as inferred intent; do not claim to recover the author's original thinking.

#### Code-map interaction

Start from `handleWebhook`. Selecting `createOrderOnce` reveals its source and relationship to the transaction; selecting the persistence step explains the event marker and order writes. Provide **Follow the flow** and **Back to overview** actions.

Every displayed relationship needs source evidence. Avoid implying that the map proves all callers, runtime paths, or downstream effects have been found.

#### Review-quiz interaction

Question: **Two copies of the same event arrive together. What prevents a second order?**

- A. Each request checks whether an order exists before writing.
- B. The database enforces a unique provider/event-ID pair inside the order transaction.
- C. The webhook handler returns a successful HTTP response.

Use **Check my answer**, then reveal feedback:

- A: “Both requests could read before either commits. Follow the write into the transaction to see what prevents two committed copies.”
- B: “Yes. The unique key prevents both copies from committing, and the marker and order are saved together. Check the duplicate-conflict handling too.”
- C: “A successful response acknowledges the request. It doesn't make the database writes unique.”

Then offer **Show the source** and **Try again**. A correct answer is a comprehension check, not an approval recommendation.

#### Comic interaction

Proposed three-panel dialogue:

1. Two workers each hold a copy of the same event. Both say: “I checked. No order yet.”
2. Both say: “Then I'll create it.” The database says: “One event. One committed order.”
3. One worker holds the order; the other gets the same order reference. Caption: “The database settles the race.”

Use **Read the next panel** and **Read the transcript**. The transcript explains the unique key and transaction and links to their source. Keep the comic focused on concurrent successful deliveries; explain rollback in the other formats.

Call the format “Comics” publicly and retain `/xkcd` as its command. These are original comics, with no claim of affiliation or endorsement.

#### Complete-bundle interaction

Use **See the complete bundle** to explore the five prepared artifacts for the same captured revision. Label each format by name so readers can compare what it adds. Explain that the installed `/code-unpacked` skill captures and analyzes once before producing the formats.

### Research notes and quotable passages

Sources checked on November 12, 2026. These studies support the importance of comprehension. They do not evaluate Code Unpacked or establish its effect on review speed, defects, or retention.

#### Comprehension takes a substantial share of working time

Source: Xin Xia, Lingfeng Bao, David Lo, Zhenchang Xing, Ahmed E. Hassan, and Shanping Li, *Measuring Program Comprehension: A Large-Scale Field Study with Professionals*. Published online in 2017; IEEE Transactions on Software Engineering, October 2018. [Author-hosted paper](https://xin-xia.github.io/publication/TSE17.pdf), abstract and introduction.

Usable claim: the study observed 78 professionals across seven projects and 3,148 working hours; comprehension activities averaged approximately 58% of their time.

Quotable passage from the abstract:

> they frequently use web browsers and document editors to perform program comprehension activities

Limits: activities were inferred from interactions across applications at two companies. The percentage covers program comprehension during development and maintenance, not just reading source or reviewing PRs. It predates current coding agents. Keep the homepage's sample size and context beside the statistic.

#### Understanding the change is central to review

Source: Alberto Bacchelli and Christian Bird, *Expectations, Outcomes, and Challenges of Modern Code Review*, ICSE, May 2013. [Microsoft Research publication](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/), abstract.

Usable claim: the study identified understanding code and changes as central to review, alongside benefits such as knowledge transfer.

Quotable passage:

> code and change understanding is the key aspect of code reviewing

Limits: the study examined teams at Microsoft before modern AI coding agents. It supports the review problem described here, without measuring these skills or proving that any particular explanation format improves review outcomes.

#### Finishing with AI does not ensure understanding

Source: Judy Hanwen Shen and Alex Tamkin, *How AI Impacts Skill Formation*, 2026 preprint. [Paper](https://arxiv.org/html/2601.20245v2), sections 4.3, 5.2, 7, and 7.1.

Usable claim: in a randomized study of 52 programmers learning the unfamiliar Trio Python library, the AI-assisted group scored lower on an immediate comprehension assessment. Exploratory analysis associated explanation-seeking and conceptual questions with higher scores among AI users.

Quotable passage from section 7:

> The high scorers only asked AI conceptual questions instead of code generation or asked for explanations to accompany generated code

Limits: a short library-learning task with a chat assistant and an immediate quiz; not a production PR-review study or a long-term skills assessment. Interaction-pattern findings are exploratory associations. They do not show that adding explanations caused better scores or that Code Unpacked improves learning. Keep this supporting source in the appendix rather than adding another statistic to the homepage.

Treat “getting code written and getting familiar with it are separate pieces of the job” as editorial framing. Avoid turning it into an unsupported claim about different brain processes, or treating explanation quality as proof of code correctness.

### Illustration ideas

- **Find a route through the diff.** An engineer follows a few connected code excerpts through a scattered change. The point is finding a useful reading order. Suggested alt text: “A reviewer follows a path through connected parts of a code change.”
- **One change, five explanations.** The same small webhook change becomes a walkthrough, a design explanation, a map, a question, and a comic. Show the different questions each answers. Suggested alt text: “Five ways to explore the same code change.”
- **Come back and build on it.** An engineer returns to the code for a follow-up feature and recognizes where the retry behavior lives. Suggested alt text: “An engineer uses their understanding of an earlier change to plan the next one.”

These are narrative briefs only. Choose style and composition during design. Prefer examples that show an engineer investigating and deciding; avoid imagery that equates a green check with understanding.

### Future showcase page

The homepage example teaches the formats. The showcase will let readers inspect real usage in context. For each entry, include the original review question, a public PR or approved source snapshot, the exact skill request, inspected outputs, and any evidence or capability gaps. Distinguish demonstrated behavior from the reviewer's conclusions.

Once that page exists, add **See real PR examples** after the homepage demonstrations and in navigation. Link each showcase artifact back to its captured revision. Keep this CTA out of the homepage until there is a working destination; no placeholder route is needed now.
