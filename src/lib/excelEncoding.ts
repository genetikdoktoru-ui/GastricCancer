import * as XLSX from 'xlsx';

/**
 * .xlsx/.xls always carry their text as UTF-8 (or a codepage the file itself declares),
 * so SheetJS decodes them correctly on its own. Plain .csv has no such metadata — Excel on
 * Turkish Windows commonly saves CSV in the Windows-1254 codepage, not UTF-8. Reading those
 * bytes as UTF-8 silently mangles the non-ASCII Turkish letters (İ, Ü, Ö, Ç, Ğ, Ş) into
 * replacement characters. Detect that case and re-decode as Windows-1254 before parsing.
 */
function looksMisdecoded(text: string): boolean {
  return text.includes('�');
}

export function readWorkbookFromBuffer(buffer: ArrayBuffer, fileName: string, mimeType?: string): XLSX.WorkBook {
  const isCsv = /\.csv$/i.test(fileName || '') || (mimeType || '').includes('csv');

  if (!isCsv) {
    return XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  }

  let bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    bytes = bytes.slice(3); // strip UTF-8 BOM
  }

  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (looksMisdecoded(text)) {
    try {
      text = new TextDecoder('windows-1254', { fatal: false }).decode(bytes);
    } catch {
      // Browser lacks the windows-1254 decoder; keep the best-effort UTF-8 text.
    }
  }

  return XLSX.read(text, { type: 'string', cellDates: true });
}
