import type { WebsiteContentState } from '../../shared/websiteContent';

interface ContentPreviewProps {
  contentState: WebsiteContentState;
}

function getHostname(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return 'Current webpage';
  }
}

export function ContentPreview({ contentState }: ContentPreviewProps) {
  if (contentState.status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite" className="sv-content-state">
        <span className="sv-spinner" />
        <div>
          <strong>Reading visible page content</strong>
          <span>Finding headings and paragraphs…</span>
        </div>
      </div>
    );
  }

  if (contentState.status === 'error') {
    return (
      <div aria-live="assertive" className="sv-content-state sv-content-state--error" role="alert">
        <span className="sv-error-icon">!</span>
        <div>
          <strong>Content unavailable</strong>
          <span>{contentState.message}</span>
        </div>
      </div>
    );
  }

  const { content } = contentState;
  const hasContent = content.headings.length > 0 || content.paragraphs.length > 0;

  return (
    <section aria-label="Extracted website content" className="sv-extracted-content">
      <div className="sv-page-summary">
        <span className="sv-page-origin">{getHostname(content.pageUrl)}</span>
        <h3>{content.pageTitle}</h3>
        <span className="sv-page-counts">
          {content.headings.length} headings · {content.paragraphs.length} paragraphs
        </span>
      </div>

      {!hasContent && (
        <p className="sv-empty-content">No visible headings or paragraphs were found on this page.</p>
      )}

      {content.headings.length > 0 && (
        <div className="sv-extracted-group">
          <h4>Headings</h4>
          <ol className="sv-heading-list">
            {content.headings.map((heading, index) => (
              <li key={`${heading.level}-${heading.text}-${index}`}>
                <span>H{heading.level}</span>
                <p>{heading.text}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {content.paragraphs.length > 0 && (
        <div className="sv-extracted-group">
          <h4>Paragraphs</h4>
          <div className="sv-paragraph-list">
            {content.paragraphs.map((paragraph, index) => (
              <p key={`${paragraph}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
