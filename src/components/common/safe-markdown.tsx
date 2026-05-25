import ReactMarkdown, { type Options } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Element } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Whitelist based on rehype-sanitize's default schema, tightened for our
 * content. We strip `style` (prevents CSS-based exfiltration), any `on*`
 * event handlers, and links that aren't http(s)/mailto.
 *
 * Audit fix (P2-7): the previous schema spread defaultSchema.attributes.a
 * (a flat string[]) with a NESTED tuple, producing a malformed
 * `[...strings, [array]]` shape. hast-util-sanitize processes that as an
 * unknown attribute and either drops `target` entirely or, worse,
 * preserves `target="_blank"` without forcing `rel="noopener noreferrer"`,
 * exposing a tabnabbing vector. We now flatten the schema and add a
 * dedicated transformer that always pins `rel` for `target="_blank"`.
 */
const SAFE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
};

/**
 * Force `rel="noopener noreferrer"` (and merge with any existing rel) on
 * every `<a target="_blank">`. Runs after rehype-sanitize so the schema
 * cannot be bypassed.
 */
function rehypeForceSafeRel() {
  return (tree: unknown) => {
    visit(tree as never, 'element', (node: Element) => {
      if (node.tagName !== 'a' || !node.properties) return;
      const target = node.properties.target;
      if (target !== '_blank') return;
      const existing = String(node.properties.rel ?? '')
        .split(/\s+/)
        .filter(Boolean);
      const merged = new Set([...existing, 'noopener', 'noreferrer']);
      node.properties.rel = [...merged].join(' ');
    });
  };
}

/**
 * Safe wrapper around `<ReactMarkdown>`. Always applies `rehype-sanitize`
 * so that user-supplied content (ticket descriptions, comments) cannot
 * inject raw HTML, inline event handlers, or javascript: URLs.
 */
export function SafeMarkdown({ children, components }: {
  children: string;
  components?: Options['components'];
}) {
  return (
    <ReactMarkdown
      rehypePlugins={[[rehypeSanitize, SAFE_SCHEMA], rehypeForceSafeRel]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
