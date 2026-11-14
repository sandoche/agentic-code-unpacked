import { z } from "astro/zod";
const text = z.string().min(1);
const link = z.object({ label: text, href: text });
const seo = z.object({ title: text, description: text, image: text, imageAlt: text });
export const homepageSchema = z
  .object({
    seo,
    brand: text,
    navigation: z.array(link),
    hero: z.object({
      title: text,
      description: text,
      primary: link,
      secondary: link,
      note: text,
      caption: text,
    }),
    skills: z
      .array(
        z.object({
          id: text,
          name: text,
          title: text,
          description: text,
          command: text,
          example: text,
          instruction: text,
        }),
      )
      .length(5),
    showcase: z.object({ title: text, description: text, action: link }),
    install: z.object({
      title: text,
      description: text,
      command: text,
      usage: text,
      codexUsage: text,
      requirements: text,
      agents: z.array(text),
      guide: link,
    }),
    faq: z.object({
      title: text,
      items: z.array(z.object({ question: text, answer: text })).min(1),
    }),
    footer: z.object({ description: text, note: text, credit: link, links: z.array(link) }),
    ui: z.object({ copy: text, copied: text, copyFallback: text }),
  })
  .superRefine((value, context) => {
    if (new Set(value.skills.map((skill) => skill.id)).size !== 5)
      context.addIssue({
        code: "custom",
        message: "Provide five unique skill sections",
        path: ["skills"],
      });
  });
export const caseStudySchema = z.object({
  title: text,
  description: text,
  run: z.enum(["react", "vue", "silk"]),
  date: z.coerce.date(),
  seo,
  takeaway: text,
  examples: z.array(z.object({ id: text, note: text })).min(1),
  limitation: text,
});
export const showcaseSchema = z.object({
  seo,
  title: text,
  description: text,
  introduction: text,
  closing: text,
});
export type HomepageContent = z.infer<typeof homepageSchema>;
