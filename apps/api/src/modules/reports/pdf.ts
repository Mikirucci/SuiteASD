import PDFDocument from 'pdfkit';
import { formatEuro } from '../fees/receipt-pdf.js';
import type { PaymentMethod } from '../../shared/enums.js';
import type { AccountingReport } from './data.js';

// PDF of the accounting report for the accountant: A4, plain tables, no decoration that costs ink.

const INK = '#111827';
const MUTED = '#4B5563';
const LINE = '#D1D5DB';
const HEAD_BG = '#EEF2FF';
const MARGIN = 48;
const FOOTER_SPACE = 40;
const CELL_PAD = 4;

const dateFormat = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
const dateTimeFormat = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});

const formatDate = (date: Date | null): string => (date ? dateFormat.format(date) : '—');

const METHOD_LABELS: Record<PaymentMethod, string> = { CASH: 'Contanti', BANK_TRANSFER: 'Bonifico', CARD: 'Carta' };
const SPONSOR_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Attivo', EXPIRED: 'Scaduto', PROSPECT: 'Potenziale' };
const TRIP_STATUS_LABELS: Record<string, string> = { PLANNED: 'Pianificata', CONFIRMED: 'Confermata', CANCELLED: 'Annullata' };
const KIND_LABELS = { INCOME: 'Entrata', EXPENSE: 'Uscita' } as const;

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

type Row = readonly string[];

class Writer {
  constructor(readonly doc: PDFKit.PDFDocument) {}

  get contentWidth(): number {
    return this.doc.page.width - MARGIN * 2;
  }

  private get bottom(): number {
    return this.doc.page.height - MARGIN - FOOTER_SPACE;
  }

  ensureSpace(height: number): void {
    if (this.doc.y + height > this.bottom) this.doc.addPage();
  }

  sectionTitle(text: string, note?: string): void {
    this.ensureSpace(60);
    this.doc.moveDown(1.2).font('Helvetica-Bold').fontSize(14).fillColor(INK).text(text, MARGIN);
    if (note) this.doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(note, MARGIN, undefined, { width: this.contentWidth });
    this.doc.moveDown(0.5);
  }

  subtitle(text: string): void {
    this.ensureSpace(40);
    this.doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).fillColor(INK).text(text, MARGIN);
    this.doc.moveDown(0.3);
  }

  paragraph(text: string): void {
    this.doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(text, MARGIN, undefined, { width: this.contentWidth });
    this.doc.moveDown(0.4);
  }

  private rowHeight(columns: readonly Column[], row: Row, bold: boolean): number {
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    const tallest = columns.reduce(
      (max, column, index) => Math.max(max, this.doc.heightOfString(row[index] ?? '', { width: column.width - CELL_PAD * 2 })),
      0,
    );
    return tallest + CELL_PAD * 2;
  }

  private drawRow(columns: readonly Column[], row: Row, options: { bold?: boolean; background?: string }): void {
    const bold = options.bold ?? false;
    const height = this.rowHeight(columns, row, bold);
    const top = this.doc.y;
    if (options.background) {
      this.doc.rect(MARGIN, top, this.contentWidth, height).fill(options.background);
    }
    this.doc.fillColor(INK).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let x = MARGIN;
    columns.forEach((column, index) => {
      this.doc.text(row[index] ?? '', x + CELL_PAD, top + CELL_PAD, {
        width: column.width - CELL_PAD * 2,
        align: column.align ?? 'left',
      });
      x += column.width;
    });
    this.doc.moveTo(MARGIN, top + height).lineTo(MARGIN + this.contentWidth, top + height).strokeColor(LINE).lineWidth(0.5).stroke();
    this.doc.x = MARGIN;
    this.doc.y = top + height;
  }

  // The header row is drawn again at the top of every page the table continues on.
  table(columns: readonly Column[], rows: readonly Row[], total?: Row): void {
    const headerRow = columns.map((column) => column.header);
    const need = this.rowHeight(columns, headerRow, true) + (rows[0] ? this.rowHeight(columns, rows[0], false) : 0);
    this.ensureSpace(need);
    this.drawRow(columns, headerRow, { bold: true, background: HEAD_BG });
    for (const row of rows) {
      if (this.doc.y + this.rowHeight(columns, row, false) > this.bottom) {
        this.doc.addPage();
        this.drawRow(columns, headerRow, { bold: true, background: HEAD_BG });
      }
      this.drawRow(columns, row, {});
    }
    if (total) {
      this.ensureSpace(this.rowHeight(columns, total, true));
      this.drawRow(columns, total, { bold: true });
    }
    this.doc.moveDown(0.6);
  }

  empty(text: string): void {
    this.paragraph(text);
  }
}

function widths(content: number, shares: readonly number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  return shares.map((share) => (content * share) / sum);
}

function cols(content: number, spec: readonly (readonly [string, number, ('left' | 'right')?])[]): Column[] {
  const sizes = widths(content, spec.map(([, share]) => share));
  return spec.map(([header, , align], index) => ({ header, width: sizes[index] ?? 0, ...(align ? { align } : {}) }));
}

function renderSummary(writer: Writer, report: AccountingReport): void {
  const columns = cols(writer.contentWidth, [['Sezione', 5], ['Voci', 1, 'right'], ['Importo', 2, 'right']]);
  const rows: string[][] = [];
  if (report.ledger) {
    rows.push(['Bilancio · saldo (entrate meno uscite)', String(report.ledger.entries.length), formatEuro(report.ledger.totals.balanceCents)]);
  }
  if (report.fees) {
    rows.push(['Quote · incassato nel periodo', String(report.fees.payments.length), formatEuro(report.fees.collectedCents)]);
    rows.push(['Quote · scadute e non incassate', String(report.fees.overdue.length), formatEuro(report.fees.overdueCents)]);
  }
  if (report.sponsors) {
    rows.push(['Sponsor · importo dei contratti', String(report.sponsors.items.length), formatEuro(report.sponsors.totalCents)]);
  }
  if (report.trips) {
    rows.push(['Trasferte · costi', String(report.trips.items.length), formatEuro(report.trips.totalCostCents)]);
  }
  if (report.referees) {
    rows.push(['Arbitri · compensi', String(report.referees.items.length), formatEuro(report.referees.totalFeeCents)]);
  }
  writer.sectionTitle('Riepilogo');
  writer.table(columns, rows);
}

function renderLedger(writer: Writer, report: AccountingReport): void {
  const ledger = report.ledger;
  if (!ledger) return;
  writer.sectionTitle('Bilancio', 'Prima nota: entrate e uscite registrate nel periodo, comprese le quote incassate.');
  const totals = cols(writer.contentWidth, [['Entrate', 1, 'right'], ['Uscite', 1, 'right'], ['Saldo', 1, 'right']]);
  writer.table(totals, [[formatEuro(ledger.totals.incomeCents), formatEuro(ledger.totals.expenseCents), formatEuro(ledger.totals.balanceCents)]]);

  if (ledger.entries.length === 0) {
    writer.empty('Nessun movimento nel periodo.');
    return;
  }
  writer.subtitle('Totali per categoria');
  writer.table(
    cols(writer.contentWidth, [['Tipo', 2], ['Categoria', 6], ['Movimenti', 2, 'right'], ['Totale', 3, 'right']]),
    ledger.categories.map((row) => [KIND_LABELS[row.kind], row.category, String(row.count), formatEuro(row.totalCents)]),
  );
  writer.subtitle('Movimenti');
  writer.table(
    cols(writer.contentWidth, [['Data', 2], ['Tipo', 2], ['Categoria', 3], ['Descrizione', 5], ['Importo', 3, 'right']]),
    ledger.entries.map((entry) => [
      formatDate(entry.occurredOn),
      KIND_LABELS[entry.kind],
      entry.category,
      entry.description ?? '',
      formatEuro(entry.kind === 'INCOME' ? entry.amountCents : -entry.amountCents),
    ]),
  );
}

function renderFees(writer: Writer, report: AccountingReport): void {
  const fees = report.fees;
  if (!fees) return;
  writer.sectionTitle('Quote e incassi', 'Incassi per data di pagamento; ricevuta numerata dove emessa.');
  if (fees.payments.length === 0) writer.empty('Nessun incasso nel periodo.');
  else {
    writer.table(
      cols(writer.contentWidth, [['Data', 2], ['Tesserato', 4], ['Causale', 4], ['Metodo', 2], ['Ricevuta', 2], ['Importo', 2, 'right']]),
      fees.payments.map((payment) => [
        formatDate(payment.paidAt),
        payment.memberName,
        payment.description,
        payment.method ? METHOD_LABELS[payment.method] : '',
        payment.receiptNumber === null ? '' : `n. ${String(payment.receiptNumber).padStart(4, '0')}`,
        formatEuro(payment.amountCents),
      ]),
      ['Totale incassato', '', '', '', '', formatEuro(fees.collectedCents)],
    );
  }
  writer.subtitle('Quote scadute e non ancora incassate');
  if (fees.overdue.length === 0) writer.empty('Nessuna quota scaduta nel periodo.');
  else {
    writer.table(
      cols(writer.contentWidth, [['Scadenza', 2], ['Tesserato', 4], ['Causale', 5], ['Importo', 2, 'right']]),
      fees.overdue.map((payment) => [formatDate(payment.dueDate), payment.memberName, payment.description, formatEuro(payment.amountCents)]),
      ['Totale da incassare', '', '', formatEuro(fees.overdueCents)],
    );
  }
}

function renderSponsors(writer: Writer, report: AccountingReport): void {
  const sponsors = report.sponsors;
  if (!sponsors) return;
  writer.sectionTitle('Sponsor', 'Contratti validi nel periodo (anche solo in parte).');
  if (sponsors.items.length === 0) { writer.empty('Nessun contratto di sponsorizzazione nel periodo.'); return; }
  writer.table(
    cols(writer.contentWidth, [['Sponsor', 5], ['Stato', 2], ['Dal', 2], ['Al', 2], ['Importo', 2, 'right']]),
    sponsors.items.map((item) => [
      item.name,
      SPONSOR_STATUS_LABELS[item.status] ?? item.status,
      formatDate(item.contractStart),
      formatDate(item.contractEnd),
      formatEuro(item.amountCents),
    ]),
    ['Totale', '', '', '', formatEuro(sponsors.totalCents)],
  );
}

function renderTrips(writer: Writer, report: AccountingReport): void {
  const trips = report.trips;
  if (!trips) return;
  writer.sectionTitle('Trasferte', 'Trasferte del periodo, escluse quelle annullate.');
  if (trips.items.length === 0) { writer.empty('Nessuna trasferta nel periodo.'); return; }
  writer.table(
    cols(writer.contentWidth, [['Partenza', 3], ['Destinazione', 6], ['Stato', 3], ['Costo', 2, 'right']]),
    trips.items.map((item) => [
      formatDate(item.departAt),
      item.destination,
      TRIP_STATUS_LABELS[item.status] ?? item.status,
      item.costCents === null ? '—' : formatEuro(item.costCents),
    ]),
    ['Totale', '', '', formatEuro(trips.totalCostCents)],
  );
}

function renderReferees(writer: Writer, report: AccountingReport): void {
  const referees = report.referees;
  if (!referees) return;
  writer.sectionTitle('Arbitri', 'Designazioni delle gare del periodo con il compenso e il rimborso.');
  if (referees.items.length === 0) { writer.empty('Nessuna designazione nel periodo.'); return; }
  writer.table(
    cols(writer.contentWidth, [['Gara del', 2], ['Arbitro', 4], ['Partita', 5], ['Compenso', 2, 'right'], ['Rimborsato il', 2]]),
    referees.items.map((item) => [
      formatDate(item.date),
      item.refereeName,
      item.match,
      item.feeCents === null ? '—' : formatEuro(item.feeCents),
      item.reimbursedAt ? formatDate(item.reimbursedAt) : item.feeCents === null ? '' : 'Da rimborsare',
    ]),
    ['Totale compensi', '', '', formatEuro(referees.totalFeeCents), ''],
  );
  writer.paragraph(`Già rimborsati: ${formatEuro(referees.reimbursedCents)} · da rimborsare: ${formatEuro(referees.totalFeeCents - referees.reimbursedCents)}.`);
}

export function accountingReportFileName(report: Pick<AccountingReport, 'society' | 'period'>, sections: number): string {
  const slug =
    report.society.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'societa';
  const day = (date: Date): string => date.toISOString().slice(0, 10);
  return `report-${slug}-${day(report.period.from)}_${day(report.period.to)}${sections === 5 ? '' : '-parziale'}.pdf`;
}

export function renderAccountingPdf(report: AccountingReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: `Report per il commercialista · ${report.society.name}`, Author: report.society.name, Producer: 'SuiteASD' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => { resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    const writer = new Writer(doc);
    const { society } = report;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(society.name, MARGIN, MARGIN);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    const identity = [
      society.fiscalCode ? `C.F. ${society.fiscalCode}` : null,
      [society.address, society.city].filter(Boolean).join(', ') || null,
      society.email,
    ].filter((line): line is string => Boolean(line));
    for (const line of identity) doc.text(line);

    doc.moveDown(1).font('Helvetica-Bold').fontSize(14).fillColor(INK).text('Report per il commercialista');
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(
      `Periodo dal ${formatDate(report.period.from)} al ${formatDate(report.period.to)} · generato il ${dateTimeFormat.format(report.generatedAt)}`,
    );

    renderSummary(writer, report);
    renderLedger(writer, report);
    renderFees(writer, report);
    renderSponsors(writer, report);
    renderTrips(writer, report);
    renderReferees(writer, report);

    // Page numbers: the footer sits in the bottom margin, so auto-paging must not see it as overflow.
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
        `${society.name} · Pagina ${index - range.start + 1} di ${range.count} · generato da SuiteASD`,
        MARGIN,
        doc.page.height - 32,
        { width: doc.page.width - MARGIN * 2, align: 'center', lineBreak: false },
      );
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}
