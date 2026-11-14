import { z } from "astro/zod";
import inventory from "../../examples/provenance.json" with { type: "json" };
const format = z.enum(["walkthrough", "reverse-design", "code-map", "review-quiz", "xkcd"]);
const url = z.url();
export const inventorySchema = z
  .object({
    schemaVersion: z.literal(1),
    runs: z.record(
      z.string(),
      z.object({
        name: z.string(),
        repository: z.string(),
        prUrl: url,
        commentUrl: url,
        bundleUrl: url,
        sourceHead: z.string().regex(/^[a-f0-9]{40}$/),
        sourceBase: z.string().regex(/^[a-f0-9]{40}$/),
        stats: z.object({
          files: z.number().int().positive(),
          commits: z.number().int().positive(),
          additions: z.number().int().nonnegative(),
          deletions: z.number().int().nonnegative(),
        }),
        artifacts: z.record(format, url),
      }),
    ),
    examples: z.array(
      z.object({
        id: z.string(),
        run: z.string(),
        format,
        title: z.string(),
        src: z.string().startsWith("/examples/"),
        scope: z.string(),
        excerpt: z.boolean(),
        presentationFix: z.string().optional(),
        originalSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        originalArtifact: url,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().positive(),
      }),
    ),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const example of value.examples) {
      if (ids.has(example.id) || !value.runs[example.run])
        context.addIssue({
          code: "custom",
          message: "Example needs a unique ID and an existing run",
        });
      ids.add(example.id);
    }
  });
export const examples = inventorySchema.parse(inventory);
export const number = (value: number): string => new Intl.NumberFormat("en-US").format(value);
export function getRun(id: string) {
  const run = examples.runs[id];
  if (!run) throw new Error("Unknown run: " + id);
  return run;
}
export function getExample(id: string) {
  const example = examples.examples.find((item) => item.id === id);
  if (!example) throw new Error("Unknown example: " + id);
  return example;
}
