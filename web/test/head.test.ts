import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The head is easy to break silently - a bad edit costs you the link preview or
 * the home-screen icon and nothing fails loudly. These pin the tags that matter.
 */

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
const publicDir = path.join(webRoot, "public");

describe("document head", () => {
  it("has a title and description", () => {
    expect(html).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(html).toMatch(/name="description"/);
  });

  it("declares a canonical URL", () => {
    expect(html).toMatch(/rel="canonical"/);
  });

  it("carries the Open Graph tags a link preview needs", () => {
    for (const tag of ["og:type", "og:url", "og:title", "og:description", "og:image"]) {
      expect(html, tag + " missing").toContain(tag);
    }
    // Dimensions let crawlers render the card without fetching the image first.
    expect(html).toContain("og:image:width");
    expect(html).toContain("og:image:alt");
  });

  it("carries Twitter card tags", () => {
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain("summary_large_image");
  });

  it("links the icons and manifest", () => {
    expect(html).toContain("/favicon.svg");
    expect(html).toContain("/apple-touch-icon.png");
    expect(html).toContain("/site.webmanifest");
  });

  it("keeps the viewport safe-area setting the board relies on", () => {
    expect(html).toContain("viewport-fit=cover");
  });
});

describe("public assets", () => {
  const assets = [
    "favicon.svg",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
    "og.png",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
  ];

  it.each(assets)("ships %s", (name) => {
    const file = path.join(publicDir, name);
    expect(fs.existsSync(file), name + " is referenced but missing").toBe(true);
    expect(fs.statSync(file).size, name + " is empty").toBeGreaterThan(0);
  });

  it("has a valid web manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "site.webmanifest"), "utf8"));
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
    // Android needs a maskable icon or it renders the icon in a white blob.
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("keeps crawlers out of the API", () => {
    const robots = fs.readFileSync(path.join(publicDir, "robots.txt"), "utf8");
    expect(robots).toContain("Disallow: /api/");
  });

  it("every icon the manifest names actually exists", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "site.webmanifest"), "utf8"));
    for (const icon of manifest.icons) {
      const file = path.join(publicDir, icon.src.replace(/^\//, ""));
      expect(fs.existsSync(file), icon.src + " named in manifest but missing").toBe(true);
    }
  });
});
