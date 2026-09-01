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

  // Flush the current field into the current row and reset the field buffer.
  const pushField = () => {
    row.push(field);
    field = '';
    startedField = false;
  };
  // Flush the current row (plus its last field) into the rows matrix.
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  // A small two-state machine: either we're inside a quoted field
  // (inQuotes) or not. Outside quotes, a quote at the (trimmed) start of a
  // field opens a quoted field; inside quotes, "" is an escaped quote and a
  // lone quote closes the field. Commas separate fields, newlines end rows.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // "" inside a quoted field is an escaped literal quote.
          field += '"';
          i++;
        } else {
          // A lone quote closes the quoted field.
          inQuotes = false;
        }
      } else {
        // Inside a quoted field, every char (commas, newlines) is literal.
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

/**
 * Cells that a spreadsheet would interpret as a FORMULA. A product named
 * "=HYPERLINK(\"http://evil\",\"x\")" or a customer who registered with a
 * "+cmd|'/C calc'!A0" name would execute when the exported CSV is opened
 * in Excel/Sheets (CSV formula injection). Neutralise by prefixing a
 * single quote, which every major spreadsheet shows as a literal text
 * character and never evaluates.
 *
 * `-` is only dangerous when followed by a non-digit (a negative number
 * like -5 must stay a number).
 */
const FORMULA_PREFIX_RE = /^[=+@\t\r]|^-[^0-9.]/;

/** Quote a single cell when it contains a comma, quote or line break. */
function csvCell(value: string): string {
  // Serialize is fed headers + data; the headers are ours and never match.
  let cell = FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
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
