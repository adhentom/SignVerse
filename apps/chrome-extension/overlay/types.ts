export type InterpreterMode = 'Website Mode' | 'YouTube Mode' | 'Google Meet Mode';

export interface ModePlaceholder {
  platformId: string;
  label: InterpreterMode;
  description: string;
  icon: 'website' | 'youtube' | 'meet';
}
