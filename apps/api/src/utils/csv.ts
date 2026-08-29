/**
 * Minimal RFC-4180-style CSV parse/serialise, dependency-free.
 *
 * The store has no CSV dependency and will not grow one for this:
 * the parser only needs the features a spreadsheet produces -
 * quoted fields, embedded quotes (""), embedded commas and
 * embedded newlines, plus CRLF line endings.
 *
 * Used by the bulk import/export feature (importExport routes).
 */

/**
 * Parse CSV text into a matrix of string cells.
 *
 * - Quoted fields may contain commas, quotes ("" -> ") and newlines.
 * - A quote that follows only leading whitespace starts a quoted field
 *   (Excel writes `value, "quoted"` with a space after the comma; the
 *   leading space is not part of the value).
 * - CRLF, LF and CR line endings are all accepted.
 * - Empty lines - trailing or in the middle (common from spreadsheets)
 *   are dropped, so a gap in the sheet is not an empty data row.
 * - Cells are returned as raw strings; numeric/boolean coercion is the
 *   caller's job (import validation reports the row for bad values).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let startedField = false; // saw a quote or a non-quote char this field

  const pushField = () => {
    row.push(field);
    field = '';
    startedField = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && (!startedField || field.trim() === '')) {
      // Opening quote: at the field start, or after whitespace only
      // (Excel/Sheets put a space after the comma before a quoted cell).
      inQuotes = true;
      field = '';
      startedField = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\r') {
      // Treat CRLF as one line break; a lone CR counts too.
      if (text[i + 1] === '\n') i++;
      pushRow();
    } else if (ch === '\n') {
      pushRow();
    } else {
      field += ch;
      startedField = true;
    }
  }
  // Flush the final field/row unless the text ended with a line break
  // (in which case the last pushRow already closed an empty row).
  if (field !== '' || row.length > 0 || !text.endsWith('\n')) {
    if (field !== '' || startedField || row.length > 0) pushRow();
  }

  // Drop every line that carries no data: trailing blank lines and
  // mid-file gaps both parse to rows of empty cells ("", "", ...).
  return rows.filter((r) => r.some((c) => c !== ''));
}

/** Quote a single cell when it contains a comma, quote or line break. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialise a header + data matrix (cells already stringified) to CSV.
 * Null/undefined cells become empty strings.
 */
export function serializeCsv(
  rows: (string | number | boolean | null | undefined)[][],
): string {
  return rows
    .map((row) => row.map((c) => csvCell(c === null || c === undefined ? '' : String(c))).join(','))
    .join('\n') + '\n';
}
