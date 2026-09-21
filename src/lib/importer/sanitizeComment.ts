import sanitizeHtml, { type Tag } from "sanitize-html";

// Allowlist-based HTML sanitizer, run on both import and every edit so
// stored content can never carry an XSS payload. Only http/https/mailto
// links survive; everything else (script, img, iframe, event handlers,
// inline style/class) is stripped.
const ALLOWED_TAGS = ["p", "a", "strong", "b", "em", "i", "ul", "ol", "li", "br", "div"];
const ALLOWED_SCHEMES = ["http", "https", "mailto"];

export interface SanitizeResult {
  clean: string;
  strippedTags: string[];
}

export function sanitizeComment(rawHtml: string): SanitizeResult {
  const strippedTags = new Set<string>();

  const clean = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "rel", "target"],
    },
    allowedSchemes: ALLOWED_SCHEMES,
    exclusiveFilter: (frame) => {
      if (!ALLOWED_TAGS.includes(frame.tag)) {
        strippedTags.add(frame.tag);
      }
      return false;
    },
    transformTags: {
      a: (tagName, attribs): Tag => {
        const href = attribs.href ?? "";
        const isSafe = ALLOWED_SCHEMES.some((scheme) =>
          href.toLowerCase().startsWith(`${scheme}:`)
        );
        if (!isSafe) {
          strippedTags.add("a[unsafe-href]");
          return { tagName: "span", attribs: {} };
        }
        return { tagName: "a", attribs: { href, rel: "noopener noreferrer", target: "_blank" } };
      },
    },
  });

  return { clean: clean.trim(), strippedTags: Array.from(strippedTags) };
}
