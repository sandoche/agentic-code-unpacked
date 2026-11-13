import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { homepageSchema, caseStudySchema, showcaseSchema } from "./lib/homepage-schema";
export const collections = {
  pages: defineCollection({
    loader: glob({ pattern: "home.md", base: "./src/content/pages" }),
    schema: homepageSchema,
  }),
  showcase: defineCollection({
    loader: glob({ pattern: "showcase.md", base: "./src/content/pages" }),
    schema: showcaseSchema,
  }),
  caseStudies: defineCollection({
    loader: glob({ pattern: "*.md", base: "./src/content/showcase" }),
    schema: caseStudySchema,
  }),
};
