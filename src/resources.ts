/**
 * Sources and further reading, by page id (the ?p= value): official specifications, datasheets, videos, articles
 * and books. Every page in a section shows a "Related resources" list at the bottom; a page with no entries yet shows
 * a short placeholder instead.
 *
 * To add one, put it under the page's id, for example:
 *
 *   uart: [
 *     { kind: 'Video', title: 'Ben Eater: How does a UART work?', url: 'https://www.youtube.com/watch?v=…' },
 *     { kind: 'Datasheet', title: 'TI: KeyStone UART user guide', url: 'https://…', note: 'Frame format and timing' },
 *   ],
 */
export type ResourceKind = 'Specification' | 'Datasheet' | 'Application note' | 'Video' | 'Article' | 'Book' | 'Tool';

export interface Resource {
  kind: ResourceKind;
  title: string;
  url: string;
  /** Optional: what it covers, or which part is relevant. */
  note?: string;
}

export const RESOURCES: Record<string, Resource[]> = {};
