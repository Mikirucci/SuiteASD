import PDFDocument from 'pdfkit';
import type { PaymentMethod } from '../../shared/enums.js';

export interface ReceiptData {
  society: { name: string; fiscalCode: string | null; address: string | null; city: string | null; email: string | null };
  number: number;
  issuedAt: Date;
  payerName: string;
  memberName: string;
  description: string;
  amountCents: number;
  method: PaymentMethod;
  paidAt: Date;
  reference: string | null;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Contanti',
  BANK_TRANSFER: 'Bonifico',
  CARD: 'Carta',
};

// "Ricevuta n. 0147": progressive per society, zero-padded to at least four digits.
export function formatReceiptCode(number: number): string {
  return String(number).padStart(4, '0');
}

export function receiptTitle(number: number): string {
  return `Ricevuta n. ${formatReceiptCode(number)}`;
}

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const dateFormat = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });

export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

export function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margin: 56,
      info: { Title: receiptTitle(data.number), Author: data.society.name, Producer: 'SuiteASD' },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    document.on('error', reject);

    const { society } = data;
    document.font('Helvetica-Bold').fontSize(20).text(society.name);
    document.font('Helvetica').fontSize(10).fillColor('#4B5563');
    const identity = [
      society.fiscalCode ? `C.F. ${society.fiscalCode}` : null,
      [society.address, society.city].filter(Boolean).join(', ') || null,
      society.email,
    ].filter((line): line is string => Boolean(line));
    for (const line of identity) document.text(line);

    document.moveDown(2).fillColor('#111827').font('Helvetica-Bold').fontSize(18).text(receiptTitle(data.number));
    document.font('Helvetica').fontSize(10).fillColor('#4B5563').text(`Emessa il ${dateFormat.format(data.issuedAt)}`);

    document.moveDown(1.5).fillColor('#111827').fontSize(12);
    const rows: [string, string][] = [
      ['Ricevuto da', data.payerName],
      ['Tesserato', data.memberName],
      ['Causale', data.description],
      ['Importo', formatEuro(data.amountCents)],
      ['Metodo di pagamento', METHOD_LABELS[data.method]],
      ['Data del pagamento', dateFormat.format(data.paidAt)],
    ];
    if (data.reference) rows.push(['Riferimento', data.reference]);
    for (const [label, value] of rows) {
      document.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
      document.moveDown(0.4);
    }

    document.moveDown(2).fontSize(9).fillColor('#6B7280').text('Documento generato da SuiteASD.');
    document.end();
  });
}
