import type {
  DatasetImportSource,
  ImportIssue,
  ImportedVocabularyRecord,
  ImportResult,
} from './types';

type RawRow = Readonly<Record<string, unknown>>;

export class DatasetImporter {
  import(sources: readonly DatasetImportSource[]): ImportResult {
    const records: ImportedVocabularyRecord[] = [];
    const issues: ImportIssue[] = [];

    for (const source of sources) {
      const parsed = source.format === 'csv'
        ? parseCsv(source.content)
        : parseJson(source.content);
      if ('error' in parsed) {
        issues.push({ datasetId: source.id, severity: 'error', message: parsed.error });
        continue;
      }
      parsed.rows.forEach((row, index) => {
        const result = mapRow(source, row, index + 2);
        if ('issue' in result) issues.push(result.issue);
        else records.push(result.record);
      });
    }
    return { records: Object.freeze(records), issues: Object.freeze(issues) };
  }
}

function mapRow(
  source: DatasetImportSource,
  row: RawRow,
  rowNumber: number,
): { record: ImportedVocabularyRecord } | { issue: ImportIssue } {
  const concept = field(row, source.fields.concept);
  const gloss = field(row, source.fields.gloss);
  if (!concept || !gloss) {
    return {
      issue: {
        datasetId: source.id,
        row: rowNumber,
        severity: 'error',
        message: 'Concept and gloss are required.',
      },
    };
  }
  return {
    record: Object.freeze({
      datasetId: source.id,
      row: rowNumber,
      tokenId: optionalField(row, source.fields.tokenId),
      concept,
      gloss,
      aliases: Object.freeze(parseAliases(optionalField(row, source.fields.aliases))),
      category: optionalField(row, source.fields.category) || source.defaults?.category || 'lexical',
      region: optionalField(row, source.fields.region) || source.defaults?.region || 'India',
      version: optionalField(row, source.fields.version) || source.defaults?.version || '1.0.0',
      source: optionalField(row, source.fields.source) || source.defaults?.source || '',
      license: optionalField(row, source.fields.license) || source.defaults?.license || '',
    }),
  };
}

function field(row: RawRow, name: string): string {
  const value = row[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function optionalField(row: RawRow, name?: string): string {
  return name ? field(row, name) : '';
}

function parseAliases(value: string): string[] {
  return value.split(/[|;]/u).map((alias) => alias.trim()).filter(Boolean);
}

function parseJson(content: string): { rows: RawRow[] } | { error: string } {
  try {
    const value: unknown = JSON.parse(content);
    const rows = Array.isArray(value)
      ? value
      : value && typeof value === 'object' && 'entries' in value
        ? (value as { entries?: unknown }).entries
        : undefined;
    if (!Array.isArray(rows) || !rows.every(isRawRow)) {
      return { error: 'JSON dataset must be an array or an object with an entries array.' };
    }
    return { rows };
  } catch {
    return { error: 'JSON dataset is not valid JSON.' };
  }
}

function isRawRow(value: unknown): value is RawRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseCsv(content: string): { rows: RawRow[] } | { error: string } {
  const matrix = csvMatrix(content);
  if (matrix.length === 0) return { error: 'CSV dataset is empty.' };
  const [headers, ...data] = matrix;
  if (headers.some((header) => !header.trim())) return { error: 'CSV headers cannot be empty.' };
  return {
    rows: data.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(
      headers.map((header, index) => [header.trim(), row[index] ?? '']),
    )),
  };
}

function csvMatrix(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
