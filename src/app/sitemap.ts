import type { MetadataRoute } from "next";

/**
 * Only the pages a stranger should be able to find.
 *
 * Order confirmations, quote links and share links are deliberately absent:
 * they are keyed on unguessable codes and belong to one customer, not to a
 * search index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://urbannighlift.com";
  const now = new Date();

  const paths = [
    { path: "", priority: 1 },
    { path: "/order", priority: 0.9 },
    { path: "/track", priority: 0.7 },
    { path: "/help", priority: 0.8 },
    { path: "/privacy", priority: 0.5 },
    { path: "/terms", priority: 0.5 },
    { path: "/rider/join", priority: 0.6 },
    { path: "/ambassador/join", priority: 0.6 },
    { path: "/merchant/join", priority: 0.6 },
  ];

  return paths.map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority,
  }));
}
