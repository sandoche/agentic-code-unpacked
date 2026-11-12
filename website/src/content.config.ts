import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { homepageSchema } from "./lib/homepage-schema";

export const collections = {
  pages: defineCollection({
    loader: glob({ pattern: "*.md", base: "./src/content/pages" }),
    schema: homepageSchema,
  }),
};
