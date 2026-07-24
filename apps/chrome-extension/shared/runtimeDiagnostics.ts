export type RuntimeDiagnosticLevel = 'debug' | 'error' | 'info' | 'warn';

export interface RuntimeDiagnosticFields {
  correlationId?: string;
  [key: string]: unknown;
}

/**
 * Emits one consistently shaped diagnostic record across content, background,
 * playback, and renderer boundaries. DevTools supplies its own timestamp, but
 * the explicit ISO value keeps copied logs correlatable with FastAPI JSON logs.
 */
export function runtimeDiagnostic(
  event: string,
  fields: RuntimeDiagnosticFields = {},
  level: RuntimeDiagnosticLevel = 'info',
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    ...fields,
  };
  console[level](`[SignVerse] ${event}`, payload);
}

export function streamCorrelationId(sessionId: string, sequence: number): string {
  return `${sessionId}:${sequence}`;
}
