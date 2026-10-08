// Generador PDF sin dependencias externas. Usa fuentes estándar de PDF para
// que el resumen pueda descargarse aun cuando la app está sin conexión.
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 36;
const TABLE_ROW_HEIGHT = 23;
const FOOTER_Y = 32;

const COLORS = {
  ink: [20, 32, 26],
  muted: [91, 111, 100],
  line: [207, 219, 211],
  accent: [15, 107, 80],
  accentSoft: [229, 243, 236],
  surface: [247, 250, 248],
  stripe: [241, 247, 243],
  white: [255, 255, 255]
};

const WIN_ANSI = {
  '€': '\x80',
  '‚': '\x82',
  'ƒ': '\x83',
  '„': '\x84',
  '…': '...',
  '†': '+',
  '‡': '++',
  'ˆ': '^',
  '‰': '%',
  'Š': 'S',
  '‹': '<',
  'Œ': 'OE',
  'Ž': 'Z',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '•': '*',
  '–': '-',
  '—': '-',
  '˜': '~',
  '™': 'TM',
  'š': 's',
  '›': '>',
  'œ': 'oe',
  'ž': 'z',
  'Ÿ': 'Y',
  '\u00a0': ' '
};

const TABLE_COLUMNS = [
  { key: 'name', label: 'FUENTE', width: 160, limit: 27 },
  { key: 'type', label: 'TIPO', width: 85, limit: 15 },
  { key: 'projectStatus', label: 'PROYECTO', width: 72, limit: 13 },
  { key: 'paymentStatus', label: 'COBRO', width: 80, limit: 15 },
  { key: 'currency', label: 'MONEDA', width: 45, limit: 6 },
  { key: 'expected', label: 'FACTURADO', width: 85, limit: 15, align: 'right' },
  { key: 'collected', label: 'COBRADO', width: 85, limit: 15, align: 'right' },
  { key: 'pending', label: 'PENDIENTE', width: 85, limit: 15, align: 'right' },
  { key: 'date', label: 'FECHA', width: 70, limit: 13 }
];

function number(value) {
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function colorCommand(color, stroke = false) {
  return `${color.map(value => (value / 255).toFixed(3)).join(' ')} ${stroke ? 'RG' : 'rg'}`;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toWinAnsi(value) {
  let output = '';
  for (const character of cleanText(value)) {
    if (WIN_ANSI[character]) {
      output += WIN_ANSI[character];
      continue;
    }
    const code = character.charCodeAt(0);
    if (code >= 32 && code <= 255) {
      output += character;
      continue;
    }
    const fallback = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const fallbackCode = fallback.charCodeAt(0);
    output += fallbackCode >= 32 && fallbackCode <= 255 ? fallback.charAt(0) : '?';
  }
  return output;
}

function pdfText(value) {
  return toWinAnsi(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncate(value, limit) {
  const text = cleanText(value);
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3)).trimEnd()}...` : text;
}

function textWidth(value, size, bold = false) {
  return toWinAnsi(value).length * size * (bold ? 0.55 : 0.5);
}

function text(ops, value, x, y, options = {}) {
  const {
    size = 10,
    bold = false,
    color = COLORS.ink,
    align = 'left'
  } = options;
  const printable = pdfText(value);
  const adjustedX = align === 'right' ? x - textWidth(value, size, bold) : x;
  ops.push(`q ${colorCommand(color)} BT /${bold ? 'F2' : 'F1'} ${number(size)} Tf 1 0 0 1 ${number(adjustedX)} ${number(y)} Tm (${printable}) Tj ET Q`);
}

function line(ops, x1, y1, x2, y2, color = COLORS.line, width = 0.6) {
  ops.push(`q ${colorCommand(color, true)} ${number(width)} w ${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S Q`);
}

function roundedRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const c = r * 0.5522847498;
  return [
    `${number(x + r)} ${number(y)} m`,
    `${number(x + width - r)} ${number(y)} l`,
    `${number(x + width - r + c)} ${number(y)} ${number(x + width)} ${number(y + r - c)} ${number(x + width)} ${number(y + r)} c`,
    `${number(x + width)} ${number(y + height - r)} l`,
    `${number(x + width)} ${number(y + height - r + c)} ${number(x + width - r + c)} ${number(y + height)} ${number(x + width - r)} ${number(y + height)} c`,
    `${number(x + r)} ${number(y + height)} l`,
    `${number(x + r - c)} ${number(y + height)} ${number(x)} ${number(y + height - r + c)} ${number(x)} ${number(y + height - r)} c`,
    `${number(x)} ${number(y + r)} l`,
    `${number(x)} ${number(y + r - c)} ${number(x + r - c)} ${number(y)} ${number(x + r)} ${number(y)} c h`
  ].join(' ');
}

function roundedRect(ops, x, y, width, height, radius, fill, stroke = null) {
  const paint = stroke ? 'B' : 'f';
  const strokePart = stroke ? ` ${colorCommand(stroke, true)} 0.6 w` : '';
  ops.push(`q ${colorCommand(fill)}${strokePart} ${roundedRectPath(x, y, width, height, radius)} ${paint} Q`);
}

function normalizeReport(report = {}) {
  const totals = report.totals || {};
  return {
    title: cleanText(report.title) || 'Resumen de facturacion mensual',
    period: cleanText(report.period) || 'Periodo sin definir',
    generatedAt: cleanText(report.generatedAt) || 'Generado desde Libreta de horas',
    exchangeRate: cleanText(report.exchangeRate) || 'Sin cotizacion USD',
    note: cleanText(report.note),
    totals: {
      mrr: cleanText(totals.mrr) || '$ 0',
      projects: cleanText(totals.projects) || '$ 0',
      total: cleanText(totals.total) || '$ 0',
      collected: cleanText(totals.collected) || '$ 0',
      pending: cleanText(totals.pending) || '$ 0'
    },
    rows: Array.isArray(report.rows) ? report.rows.map(row => ({
      name: cleanText(row?.name) || 'Sin nombre',
      type: cleanText(row?.type) || '-',
      projectStatus: cleanText(row?.projectStatus) || '-',
      paymentStatus: cleanText(row?.paymentStatus) || '-',
      currency: cleanText(row?.currency) || 'ARS',
      expected: cleanText(row?.expected) || '$ 0',
      collected: cleanText(row?.collected) || '$ 0',
      pending: cleanText(row?.pending) || '$ 0',
      date: cleanText(row?.date) || '-'
    })) : []
  };
}

function drawSummaryCard(ops, x, y, width, label, value, detail = '') {
  roundedRect(ops, x, y, width, 62, 9, COLORS.surface, COLORS.line);
  text(ops, truncate(label.toUpperCase(), 25), x + 12, y + 43, { size: 7.4, bold: true, color: COLORS.muted });
  text(ops, truncate(value, 20), x + 12, y + 23, { size: 16, bold: true, color: COLORS.ink });
  if (detail) text(ops, truncate(detail, 31), x + 12, y + 9, { size: 7.2, color: COLORS.muted });
}

function drawTableHeader(page, y) {
  const { ops } = page;
  const tableWidth = TABLE_COLUMNS.reduce((total, column) => total + column.width, 0);
  roundedRect(ops, MARGIN, y - 20, tableWidth, 20, 6, COLORS.ink);
  let x = MARGIN;
  for (const column of TABLE_COLUMNS) {
    const textX = column.align === 'right' ? x + column.width - 7 : x + 7;
    text(ops, column.label, textX, y - 13, { size: 6.8, bold: true, color: COLORS.white, align: column.align || 'left' });
    x += column.width;
  }
  page.cursor = y - 20;
}

function drawDetailRow(page, row, index) {
  const { ops } = page;
  const bottom = page.cursor - TABLE_ROW_HEIGHT;
  const tableWidth = TABLE_COLUMNS.reduce((total, column) => total + column.width, 0);
  if (index % 2 === 0) ops.push(`q ${colorCommand(COLORS.stripe)} ${number(MARGIN)} ${number(bottom)} ${number(tableWidth)} ${number(TABLE_ROW_HEIGHT)} re f Q`);
  line(ops, MARGIN, bottom, MARGIN + tableWidth, bottom, COLORS.line, 0.45);
  let x = MARGIN;
  for (const column of TABLE_COLUMNS) {
    const value = truncate(row[column.key], column.limit);
    const textX = column.align === 'right' ? x + column.width - 7 : x + 7;
    text(ops, value, textX, bottom + 8, { size: 7.4, color: COLORS.ink, align: column.align || 'left' });
    x += column.width;
  }
  page.cursor = bottom;
}

function createPage(report, continuation) {
  const ops = [];
  ops.push(`q ${colorCommand(COLORS.white)} 0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f Q`);
  ops.push(`q ${colorCommand(COLORS.accent)} 0 ${PAGE_HEIGHT - 6} ${PAGE_WIDTH} 6 re f Q`);
  const page = { ops, cursor: 0 };

  if (continuation) {
    text(ops, report.title, MARGIN, 548, { size: 16, bold: true, color: COLORS.ink });
    text(ops, `${report.period} - Detalle de facturacion`, MARGIN, 531, { size: 9, color: COLORS.muted });
    text(ops, report.generatedAt, PAGE_WIDTH - MARGIN, 548, { size: 8, color: COLORS.muted, align: 'right' });
    line(ops, MARGIN, 516, PAGE_WIDTH - MARGIN, 516, COLORS.line, 0.7);
    drawTableHeader(page, 502);
    return page;
  }

  text(ops, report.title, MARGIN, 548, { size: 22, bold: true, color: COLORS.ink });
  text(ops, report.period, MARGIN, 527, { size: 11, color: COLORS.muted });
  text(ops, 'LIBRETA DE HORAS', PAGE_WIDTH - MARGIN, 548, { size: 8, bold: true, color: COLORS.accent, align: 'right' });
  text(ops, report.generatedAt, PAGE_WIDTH - MARGIN, 532, { size: 8, color: COLORS.muted, align: 'right' });
  line(ops, MARGIN, 513, PAGE_WIDTH - MARGIN, 513, COLORS.line, 0.7);

  const cardGap = 10;
  const cardWidth = (PAGE_WIDTH - (MARGIN * 2) - (cardGap * 3)) / 4;
  const cardY = 433;
  drawSummaryCard(ops, MARGIN, cardY, cardWidth, 'Recurrentes', report.totals.mrr);
  drawSummaryCard(ops, MARGIN + cardWidth + cardGap, cardY, cardWidth, 'Proyectos', report.totals.projects);
  drawSummaryCard(ops, MARGIN + (cardWidth + cardGap) * 2, cardY, cardWidth, 'Total estimado', report.totals.total);
  drawSummaryCard(ops, MARGIN + (cardWidth + cardGap) * 3, cardY, cardWidth, 'Cobrado', report.totals.collected, `Pendiente ${report.totals.pending}`);

  text(ops, 'DETALLE DE FACTURACION', MARGIN, 399, { size: 10, bold: true, color: COLORS.ink });
  const helper = report.note || `Dolar oficial BCRA: ${report.exchangeRate}`;
  text(ops, truncate(helper, 132), MARGIN, 384, { size: 8.2, color: COLORS.muted });
  drawTableHeader(page, 367);
  return page;
}

function addFooter(page, pageNumber, pageCount) {
  line(page.ops, MARGIN, FOOTER_Y, PAGE_WIDTH - MARGIN, FOOTER_Y, COLORS.line, 0.6);
  text(page.ops, 'Libreta de horas - Hub central de ingresos', MARGIN, FOOTER_Y - 14, { size: 7.2, color: COLORS.muted });
  text(page.ops, `Pagina ${pageNumber} de ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y - 14, { size: 7.2, color: COLORS.muted, align: 'right' });
}

function toPdfBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function buildPdfDocument(pageContents) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const pageReferences = [];
  let nextObject = 5;

  for (const content of pageContents) {
    const pageObject = nextObject;
    const contentObject = nextObject + 1;
    nextObject += 2;
    pageReferences.push(pageObject);
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Kids [${pageReferences.map(reference => `${reference} 0 R`).join(' ')}] /Count ${pageReferences.length} >>`;
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return toPdfBytes(pdf);
}

export function buildMonthlyInvoicePdf(report) {
  const normalized = normalizeReport(report);
  const pages = [createPage(normalized, false)];
  let page = pages[0];
  normalized.rows.forEach((row, index) => {
    if (page.cursor - TABLE_ROW_HEIGHT < FOOTER_Y + 20) {
      page = createPage(normalized, true);
      pages.push(page);
    }
    drawDetailRow(page, row, index);
  });
  if (!normalized.rows.length) {
    text(page.ops, 'No hay conceptos facturables para este periodo.', MARGIN + 7, page.cursor - 16, { size: 9, color: COLORS.muted });
  }
  pages.forEach((item, index) => addFooter(item, index + 1, pages.length));
  return buildPdfDocument(pages.map(pageItem => pageItem.ops.join('\n')));
}
