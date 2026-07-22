export interface ExtractedHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface WebsiteContent {
  pageTitle: string;
  pageUrl: string;
  headings: ExtractedHeading[];
  paragraphs: string[];
  readingContext?: {
    source: 'selection' | 'caret' | 'pointer' | 'viewport';
    tagName: string;
    truncated: boolean;
  };
}

export type WebsiteContentState =
  | { status: 'loading' }
  | { status: 'ready'; content: WebsiteContent }
  | { status: 'error'; message: string };
