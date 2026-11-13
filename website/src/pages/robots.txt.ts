import type { APIRoute } from "astro";
export const GET: APIRoute = ({ site }) => {
  const preview =
    import.meta.env.CONTEXT === "deploy-preview" || import.meta.env.CONTEXT === "branch-deploy";
  return new Response(
    "User-agent: *\n" +
      (preview
        ? "Disallow: /\n"
        : "Allow: /\nSitemap: " + new URL("/sitemap.xml", site).href + "\n"),
    { headers: { "Content-Type": "text/plain" } },
  );
};
