import sanitizeHtml, { type Tag } from "sanitize-html";

/**
 * Allowlist chosen from what the actual Spectora export contains
 * (inspected the real fixture): <p>, <a href>, <strong>, <div>, plus a few
 * common rich-text siblings (<em>, <ul>, <li>, <br>, <b>, <i>) that another
 * export in the same format could plausibly use. Anything else - <script>,
 * <img>, <table>, <iframe>, event handlers, style/class attributes - is
 * stripped. javascript: and data: URLs are rejected; only http/https/mailto
 * links survive.
 *
 * We sanitize both on import AND before saving any user edit, so stored
 * content can never carry an XSS payload regardless of where it came from.
 */
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
      a: ["href"],
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
