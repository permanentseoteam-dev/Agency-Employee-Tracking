// CSV for spreadsheets: quoted where needed, CRLF line ends and a BOM so Excel reads UTF-8.

function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: string[][]): string {
  return '﻿' + rows.map((cols) => cols.map(cell).join(',')).join('\r\n') + '\r\n'
}
