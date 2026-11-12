import { z } from "astro/zod";

const text = z.string().min(1);
const link = z.object({ label: text, href: text });
const source = z.object({ file: text, code: text });
const moment = z.object({ id: text, title: text, explanation: text, source });
const diagram = z.object({ title: text, steps: z.array(text).min(2), note: text });
const demoBase = { id: text, label: text, command: text, title: text, description: text };

const walkthrough = z.object({
  ...demoBase,
  kind: z.literal("walkthrough"),
  steps: z.array(moment).min(2),
});
const design = z.object({
  ...demoBase,
  kind: z.literal("reverse-design"),
  cases: z.array(z.object({ id: text, label: text, diagram, explanation: text })).min(2),
});
const map = z
  .object({
    ...demoBase,
    kind: z.literal("code-map"),
    nodes: z.array(z.object({ id: text, name: text, role: text, source })).min(2),
    edges: z.array(z.object({ from: text, to: text, label: text })).min(1),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.nodes.map((node) => node.id));
    if (
      ids.size !== value.nodes.length ||
      value.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))
    ) {
      context.addIssue({
        code: "custom",
        message: "Map edges must reference unique existing nodes",
        path: ["edges"],
      });
    }
  });
const question = z
  .object({
    id: text,
    prompt: text,
    diagram: diagram.optional(),
    options: z.array(z.object({ id: text, text, feedback: text })).min(3),
    correctOptionId: text,
    explanation: text,
    explanationDiagram: diagram.optional(),
    source,
  })
  .superRefine((value, context) => {
    if (!value.options.some((option) => option.id === value.correctOptionId)) {
      context.addIssue({
        code: "custom",
        message: "Correct answer must reference an option",
        path: ["correctOptionId"],
      });
    }
    if (new Set(value.options.map((option) => option.id)).size !== value.options.length) {
      context.addIssue({ code: "custom", message: "Answer IDs must be unique", path: ["options"] });
    }
  });
const quiz = z
  .object({
    ...demoBase,
    kind: z.literal("review-quiz"),
    questions: z.array(question).min(1),
  })
  .superRefine((value, context) => {
    if (new Set(value.questions.map((question) => question.id)).size !== value.questions.length) {
      context.addIssue({
        code: "custom",
        message: "Question IDs must be unique",
        path: ["questions"],
      });
    }
  });
const comic = z.object({
  ...demoBase,
  kind: z.literal("xkcd"),
  image: text,
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  alt: text,
  panels: z.array(z.object({ title: text, transcript: text })).length(3),
  source,
});

export const demoSchema = z.discriminatedUnion("kind", [walkthrough, design, map, quiz, comic]);

export const homepageSchema = z
  .object({
    seo: z.object({ title: text, description: text, canonical: z.url() }),
    brand: text,
    navigation: z.array(link),
    hero: z.object({
      title: text,
      description: text,
      primary: link,
      secondary: link,
      source,
      note: text,
      constraint: text,
    }),
    problem: z.object({
      title: text,
      description: text,
      moments: z.array(z.object({ title: text, text })).length(3),
    }),
    approach: z.object({
      title: text,
      description: text,
      license: text,
      facts: z.array(text).length(3),
    }),
    skills: z.object({ title: text, description: text, example: text, disclosure: text }),
    demos: z.array(demoSchema).length(5),
    bundle: z.object({ title: text, text, command: text }),
    research: z.object({
      title: text,
      figure: text,
      explanation: text,
      detail: text,
      source: link,
      review: text,
      reviewSource: link,
    }),
    install: z.object({
      title: text,
      description: text,
      command: text,
      usage: text,
      codexUsage: text,
      codexLabel: text,
      detailsLabel: text,
      requirements: text,
      agents: z.array(text),
      guide: link,
    }),
    faq: z.object({
      title: text,
      items: z.array(z.object({ question: text, answer: text })).min(1),
    }),
    closing: z.object({ title: text, text, action: link }),
    footer: z.object({ description: text, links: z.array(link), license: link }),
    ui: z.object({
      copy: text,
      copied: text,
      copyFallback: text,
      previous: text,
      next: text,
      previousPanel: text,
      nextPanel: text,
      source: text,
      check: text,
      retake: text,
      answerRequired: text,
      correct: text,
      incorrect: text,
      score: text,
      question: text,
      transcript: text,
      panel: text,
      skip: text,
      menu: text,
    }),
  })
  .superRefine((value, context) => {
    const kinds = new Set(value.demos.map((demo) => demo.kind));
    const ids = new Set(value.demos.map((demo) => demo.id));
    if (kinds.size !== 5 || ids.size !== 5) {
      context.addIssue({
        code: "custom",
        message: "Provide one demo per format with unique IDs",
        path: ["demos"],
      });
    }
  });

export type HomepageContent = z.infer<typeof homepageSchema>;
export type Demo = z.infer<typeof demoSchema>;
export type DiagramContent = z.infer<typeof diagram>;
export type SourceContent = z.infer<typeof source>;
