---
seo:
  title: "Code Unpacked — Your PR is a monster."
  description: "Five open-source skills for understanding big pull requests. Try real walkthroughs, design docs, code maps, quizzes and comics from React, Vue and Silk."
  image: /og/home.png
  imageAlt: "Code Unpacked: Your PR is a monster. Three illustrated creatures made from code diffs."
brand: Code Unpacked
navigation:
  - { label: The skills, href: "/#skills" }
  - { label: Real runs, href: /showcase/ }
  - { label: FAQ, href: "/#faq" }
  - { label: GitHub, href: "https://github.com/sandoche/agentic-code-unpacked" }
hero:
  title: Your PR is a monster.
  description: "Five ways to understand it before you type “LGTM”."
  primary: { label: Install the skills, href: "#install" }
  secondary: { label: Try a real example, href: "#skills" }
  note: Just one more file.
  caption: Three real PRs that earned the illustration.
skills:
  - id: walkthrough
    name: Walkthrough
    title: Start somewhere better than file one.
    description: "A diff has an order. It probably isn't the order you need. Follow a reading path that explains the change, then puts the relevant source beside it."
    command: /walkthrough
    example: silk-walkthrough
    instruction: "Try it: use Next to follow Silk's fast decoder from its guard rails into the code."
  - id: reverse-design
    name: Reverse design
    title: Read the design hiding in the diff.
    description: "Reconstruct the moving parts, the boundaries and the awkward cases. Architecture and sequence diagrams give you something to check against the source."
    command: /reverse-design
    example: vue-design
    instruction: "Try it: explore Vue's design documents and follow a diagram's source references."
  - id: code-map
    name: Code map
    title: Find the code behind the claim.
    description: "Thousands of files. A handful of useful starting points. Search the inventory, inspect a function, and follow the connections the analysis can support."
    command: /code-map
    example: react-map
    instruction: "Try it: inspect compileProgram, follow its connections, then use zoom and Fit files to explore this excerpt."
  - id: review-quiz
    name: Review quiz
    title: Find out what you missed.
    description: "Reading an explanation can feel suspiciously like understanding it. Answer questions about behavior and architecture, then check your reasoning against the evidence."
    command: /review-quiz
    example: vue-quiz
    instruction: "Try it: choose an answer, check the feedback, and follow the source. Retakes are encouraged."
  - id: xkcd
    name: Comics
    title: Remember the bit that bites.
    description: "Some ideas stick better as a small argument between functions. A source-backed comic makes one tricky constraint memorable enough to bring into the review."
    command: /xkcd
    example: react-comic
    instruction: "Try it: read the strip, then open its transcript to see where the metaphor stops."
showcase:
  title: We brought actual monsters.
  description: "A compiler import, a new renderer, and a decoder with an unsafe fast path. Here's what the skills helped make legible."
  action: { label: Read all three runs, href: /showcase/ }
install:
  title: Bring your own monster.
  description: "Free, open-source skills. Your existing coding agent. Start with one format, or run /code-unpacked for all five."
  command: npx skills add sandoche/agentic-code-unpacked
  usage: /walkthrough pr https://github.com/owner/repo/pull/123 --draft
  codexUsage: $walkthrough pr https://github.com/owner/repo/pull/123 --draft
  requirements: "Node.js 22.23.4+ with npm. Start a new agent session after installation. First use downloads the rendering tools."
  agents: [Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode]
  guide:
    {
      label: Read the usage guide,
      href: "https://github.com/sandoche/agentic-code-unpacked/blob/main/docs/usage.md",
    }
faq:
  title: Fair questions.
  items:
    - question: What am I installing?
      answer: "Instructions and tools for the coding agent you already use. Install an individual skill, or code-unpacked for the complete five-format bundle. There's no separate Code Unpacked account."
    - question: Is this only for AI-written code?
      answer: "No. Bring a PR, branch, repository, selected files or pasted code, whoever wrote it. AI can make the pile grow faster; understanding the pile is the useful part."
    - question: How is this different from a PR summary?
      answer: "A summary tells you what changed. These formats give you a way through it: a reading order, reconstructed design, explorable connections, questions to answer, or a comic about one important constraint."
    - question: Can the explanations be wrong?
      answer: "Yes. Your agent generates them. Use the source references to check important claims. Missing evidence, inferred intent and unsupported code should stay visible. The real runs show those boundaries too."
    - question: Does a good quiz score mean I should approve?
      answer: "It means you understood the exercise. Correctness, tests, security and whether the change solves the right problem still need your judgment."
    - question: Where does my code go?
      answer: "Your agent's configured providers and data-handling rules apply. Artifacts save under .code-unpacked/. Use --draft to keep delivery local. Posting to a PR requires an explicit request and authenticated access."
    - question: Can I open the results without the agent?
      answer: "Yes. Finished HTML opens locally and works offline. Large outputs may arrive as a ZIP: extract it first. The website previews are selected from real runs; each links to its original result and complete bundle."
    - question: Is it free?
      answer: "The software is free, open source and MIT licensed, including commercial use. Your agent, model provider and image-generation service may charge for usage."
    - question: What do comics and video need?
      answer: "Comics need an available image-generation tool. Without one, the workflow can retain its storyboard and prompts. Optional video export needs FFmpeg; the interactive HTML does not."
footer:
  description: "Make the change understandable. Then make the call."
  links:
    - { label: GitHub, href: "https://github.com/sandoche/agentic-code-unpacked" }
    - {
        label: Usage guide,
        href: "https://github.com/sandoche/agentic-code-unpacked/blob/main/docs/usage.md",
      }
    - {
        label: MIT license,
        href: "https://github.com/sandoche/agentic-code-unpacked/blob/main/LICENSE",
      }
ui:
  copy: Copy
  copied: Copied
  copyFallback: Select the command and copy it manually.
---

Homepage copy is maintained in this front matter. The example references resolve to versioned, verified artifacts in examples/provenance.json.
