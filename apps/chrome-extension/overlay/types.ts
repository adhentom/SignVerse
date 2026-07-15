export type InterpreterMode = 'Website Mode' | 'YouTube Mode' | 'Google Meet Mode';

export interface ModePlaceholder {
  label: InterpreterMode;
  description: string;
  icon: 'website' | 'youtube' | 'meet';
}
