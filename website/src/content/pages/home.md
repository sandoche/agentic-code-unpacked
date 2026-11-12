---
seo:
  title: Code Unpacked | Understand the PR before it ships
  description: Free, open-source skills that help engineers understand AI-written PRs through walkthroughs, design docs, code maps, quizzes, and comics. Runs through your coding agent.
  canonical: https://codeunpacked.san.cx/
brand: Code Unpacked
navigation:
  - { label: The skills, href: "#skills" }
  - { label: Why understand it?, href: "#why" }
  - { label: FAQ, href: "#faq" }
  - { label: GitHub, href: "https://github.com/sandoche/agentic-code-unpacked" }
hero:
  title: Stop pretending you understand that PR.
  description: Understand AI-written code before you review it or build on it.
  primary: { label: Install the skills, href: "#install" }
  secondary: { label: Explore an example, href: "#skills" }
  source:
    file: orders.ts
    code: |
      await db.transaction(async (tx) => {
        const order = await tx.orders.create(payload);
        await tx.events.insert({
          provider,
          eventId,
          orderId: order.id
        });
        return order;
      });
  constraint: UNIQUE(provider, eventId)
  note: Two deliveries. One committed order.
problem:
  title: The diff is only the start.
  description: Passing tests don’t explain the change.
  moments:
    - title: Where do I start?
      text: Six files changed. The connection matters.
    - title: What happens when it fails?
      text: Follow the retry, rollback, and unhappy path.
    - title: How would I extend it?
      text: Know which assumptions the next feature could break.
approach:
  title: Your agent. A clearer picture.
  description: Choose a PR, branch, repository, or selected code.
  license: Free and open source. MIT licensed.
  facts:
    - Runs through your existing agent.
    - Saves local artifacts you can open offline.
    - No separate Code Unpacked account or cloud service.
skills:
  title: One PR. Five ways in.
  description: Choose a format.
  example: Stop duplicate webhooks creating duplicate orders.
  disclosure: Illustrative example. Not a real PR.
demos:
  - kind: walkthrough
    id: walkthrough
    label: Walkthrough
    command: /walkthrough
    title: Find a useful reading order.
    description: A reading order with source.
    steps:
      - id: receive
        title: Receive the event
        explanation: Follow the provider and event ID into order creation.
        source:
          file: webhook.ts
          code: |
            type WebhookEvent = {
              provider: string;
              id: string;
              payload: Record<string, unknown>;
            };

            async function handleWebhook(event: WebhookEvent) {
              return createOrderOnce(event);
            }
      - id: transaction
        title: Save both records together
        explanation: The order and event marker share one transaction. The database enforces a unique provider/event-ID pair.
        source:
          file: orders.ts
          code: |
            await db.transaction(async (tx) => {
              const order = await tx.orders.create(event.payload);
              await tx.events.insert({
                provider: event.provider,
                eventId: event.id,
                orderId: order.id
              });
              return order;
            });
      - id: duplicate
        title: Handle another delivery
        explanation: A duplicate returns the existing order. If creation failed, the transaction left neither record, so a later delivery can retry.
        source:
          file: orders.ts
          code: |
            if (!isDuplicateEvent(error)) throw error;
            return db.orders.forEvent(event.provider, event.id);
  - kind: reverse-design
    id: reverse-design
    label: Reverse design
    command: /reverse-design
    title: See how the pieces fit.
    description: Reconstruct behavior and architecture from the source.
    cases:
      - id: first
        label: First delivery
        diagram:
          title: One transaction
          steps: [Receive event, Create order, Save event marker, Commit both]
          note: The unique key belongs to the database.
        explanation: Both records become visible together. The event marker links this delivery to its order.
      - id: duplicate
        label: Duplicate
        diagram:
          title: Existing event
          steps:
            [Receive same event, Unique key conflicts, Roll back attempt, Return existing order]
          note: A prior read alone cannot settle the race.
        explanation: The second attempt cannot commit another marker. Its order is rolled back, and the handler returns the first committed order.
      - id: failure
        label: Rollback
        diagram:
          title: Failed creation
          steps: [Receive event, Order creation fails, Roll back both records, Allow a later retry]
          note: No marker remains for an order that never committed.
        explanation: This is observed behavior in the example. The reason for choosing this design would be labeled as inferred intent in generated design documents.
  - kind: code-map
    id: code-map
    label: Code map
    command: /code-map
    title: Follow the connections.
    description: Select a function to see its role and source.
    nodes:
      - id: handler
        name: handleWebhook
        role: Receives the delivery and passes the event to order creation.
        source: { file: webhook.ts, code: "return createOrderOnce(event);" }
      - id: create
        name: createOrderOnce
        role: Coordinates the transaction and handles a duplicate event.
        source: { file: orders.ts, code: "return await db.transaction(saveOrderAndEvent);" }
      - id: transaction
        name: saveOrderAndEvent
        role: Writes the order and unique event marker atomically.
        source:
          file: orders.ts
          code: |
            const order = await tx.orders.create(event.payload);
            await tx.events.insert({ provider, eventId, orderId: order.id });
    edges:
      - { from: handler, to: create, label: calls }
      - { from: create, to: transaction, label: runs in transaction }
  - kind: review-quiz
    id: review-quiz
    label: Review quiz
    command: /review-quiz
    title: Could you explain it yourself?
    description: Try two questions about behavior and architecture.
    questions:
      - id: race
        prompt: Two copies arrive together. What prevents a second committed order?
        options:
          - id: read
            text: Each request checks for an existing order first.
            feedback: Both requests could read before either commits. Check the write constraint.
          - id: unique
            text: A unique event key inside the order transaction.
            feedback: Yes. The database prevents two committed markers, and each marker shares its transaction with its order.
          - id: response
            text: The handler returns a successful HTTP response.
            feedback: A successful response acknowledges a delivery. It does not make writes unique.
        correctOptionId: unique
        explanation: The unique provider/event-ID pair settles concurrent attempts. A conflicting transaction rolls back its order.
        source: { file: schema.sql, code: "UNIQUE (provider, event_id)" }
      - id: architecture
        prompt: Where should the event marker be written?
        diagram:
          title: Complete the flow
          steps: [Webhook handler, Create order, "? Save event marker"]
          note: Choose the transaction boundary before revealing the diagram.
        options:
          - id: before
            text: Before order creation, in a separate transaction.
            feedback: A failed order could leave a marker that blocks the next retry.
          - id: same
            text: In the same transaction as order creation.
            feedback: Yes. Both writes commit or roll back together.
          - id: after
            text: After the response, in a background task.
            feedback: A retry could arrive before the marker is stored.
        correctOptionId: same
        explanation: The order and marker are one atomic unit. A failure leaves neither behind.
        explanationDiagram:
          title: The completed architecture
          steps: [Receive event, Begin transaction, Write order + marker, Commit together]
          note: On failure, roll back both writes.
        source:
          file: orders.ts
          code: |
            await db.transaction(async (tx) => {
              await saveOrderAndEvent(tx, event);
            });
  - kind: xkcd
    id: xkcd
    label: Comics
    command: /xkcd
    title: Make the tricky bit stick.
    description: A small story about two workers and one database rule.
    image: /images/webhook-race.png
    imageWidth: 2146
    imageHeight: 733
    alt: Three-panel stick-figure comic. Two workers read the same missing order, attempt to create it, and receive the same committed order after the database settles the race.
    panels:
      - title: The prior read
        transcript: "Two workers hold the same event. “I checked. No order yet.” “So did I.”"
      - title: The race
        transcript: "Both say, “I’ll create it.” The database says, “One event. One committed order.”"
      - title: The constraint
        transcript: "Both point to order 17. “The database settles the race.”"
    source:
      file: schema.sql
      code: UNIQUE (provider, event_id)
bundle:
  title: Want the whole picture?
  text: Generate all five formats from one snapshot and shared analysis.
  command: /code-unpacked
research:
  title: Understanding is part of the work.
  figure: 58%
  explanation: of working time went to program comprehension in one field study.
  detail: 78 professional developers. Seven projects. Development and maintenance activities, beyond PR review.
  source: { label: Read the field study, href: "https://xin-xia.github.io/publication/TSE17.pdf" }
  review: Research at Microsoft also identified understanding code and changes as central to code review.
  reviewSource:
    {
      label: Read the review research,
      href: "https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/",
    }
install:
  title: Bring a PR. Start here.
  description: Run this in your project, then choose your skills and agent.
  command: npx skills add sandoche/agentic-code-unpacked
  usage: /walkthrough pr https://github.com/owner/repo/pull/123 --draft
  codexUsage: $walkthrough pr https://github.com/owner/repo/pull/123 --draft
  codexLabel: Using Codex?
  detailsLabel: Requirements and supported agents
  requirements: Node.js 22.23.4+ with npm. Start a new agent session after installation.
  agents: [Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode]
  guide:
    {
      label: Read the usage guide,
      href: "https://github.com/sandoche/agentic-code-unpacked/blob/main/docs/usage.md",
    }
faq:
  title: A few practical questions.
  items:
    - question: What is a skill?
      answer: A skill gives your coding agent instructions and tools for a task. Install it, then invoke it in the agent you already use.
    - question: Does this work on human-written code?
      answer: Yes. Use it on a PR, branch, repository, selected files, or pasted code, whoever wrote it.
    - question: How is it different from a PR summary?
      answer: A summary gives you an overview. These skills produce a reading order, design documents, an explorable map, questions, or comics you can work through.
    - question: Can the explanations be wrong?
      answer: Yes. Your agent generates them. Follow the source references to check important claims. Inferred intent and missing evidence should be identified in the output.
    - question: Does passing the quiz mean the PR is safe?
      answer: No. The quiz checks understanding of the explained code. You still assess correctness, tests, security, and whether the change solves the problem.
    - question: Where does my code go?
      answer: Your agent’s configured providers and data-handling rules apply. Artifacts save under .code-unpacked/. Posting to a PR requires an explicit request and authenticated access. The --draft option stays local.
    - question: Does it need a cloud service?
      answer: Code Unpacked runs through your existing agent without its own hosted service or account. First use downloads rendering tools. Offline generation needs local source, cached tools, and an agent with a local model. Finished HTML opens offline.
    - question: Is it free for commercial use?
      answer: Yes. The software is free, open source, and MIT licensed. Your agent, model provider, or image-generation service may charge for usage.
    - question: Do I need all five formats?
      answer: No. Install an individual skill or install code-unpacked for the complete bundle. The bundle includes all five formats, without separate installations.
    - question: What about video and comics?
      answer: Optional video export needs FFmpeg. Comics need an available image-generation tool. Without one, the workflow saves its storyboard and prompts for later.
closing:
  title: Understand it. Then make the call.
  text: Start with the PR you’re about to write “looks good” on.
  action: { label: Install the skills, href: "#install" }
footer:
  description: Free, open-source skills for engineers who review what they ship.
  links:
    - { label: GitHub, href: "https://github.com/sandoche/agentic-code-unpacked" }
    - {
        label: Usage guide,
        href: "https://github.com/sandoche/agentic-code-unpacked/blob/main/docs/usage.md",
      }
  license:
    {
      label: MIT license,
      href: "https://github.com/sandoche/agentic-code-unpacked/blob/main/LICENSE",
    }
ui:
  copy: Copy command
  copied: Copied
  copyFallback: Select the command and copy it manually.
  previous: Previous step
  next: Next step
  previousPanel: Previous panel
  nextPanel: Next panel
  source: Read the source
  check: Check my answers
  retake: Retake quiz
  answerRequired: Choose an answer for each question first.
  correct: Correct
  incorrect: Take another look
  score: Your score
  question: Question
  transcript: Read the transcript
  panel: Panel
  skip: Skip to content
  menu: Navigation
---

The front matter is the canonical website content. Previews share an illustrative webhook change; they do not claim to show a real customer PR.
