import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { round2 } from '../../../utils/money';
import {
  Order,
  OrderDocument,
  PaymentMethod,
} from '../schemas/order.schema';

export interface GstLine {
  /** 1-based index for the invoice row. */
  sl: number;
  description: string;
  hsn: string;
  quantity: number;
  unitPrice: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface GstInvoice {
  invoiceNumber: string;
  orderNumber: string;
  issuedAt: Date;
  paymentMethod: PaymentMethod;
  isInterState: boolean;

  seller: {
    name: string;
    gstin: string;
    address: string;
    state: string;
  };
  buyer: {
    name: string;
    gstin?: string;
    address: string;
    state: string;
    phone: string;
    email?: string;
  };

  lines: GstLine[];

  totals: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    discount: number;
    shippingFee: number;
    codFee: number;
    walletAmount: number;
    grandTotal: number;
    payable: number;
    /** Amount in words ("Rupees twelve thousand four hundred only"). */
    inWords: string;
    currency: 'INR';
  };
}

const HSN_DEFAULT = '6203'; // apparel HSN — placeholder until the
                            // product catalog carries per-SKU HSN codes.

/**
 * Renders Indian GST-compliant invoice data + HTML from a persisted
 * Order. Pure-ish: pulls a couple of seller constants out of config
 * but performs no I/O. Result is JSON-friendly so it can be returned
 * directly from a controller, or piped through a renderer to PDF.
 */
@Injectable()
export class GstInvoiceService {
  constructor(private readonly config: ConfigService) {}

  build(order: OrderDocument): GstInvoice {
    const seller = {
      name: this.config.get<string>('SELLER_NAME') ?? 'Lumière Retail Pvt Ltd',
      gstin:
        this.config.get<string>('SELLER_GSTIN') ?? '29ABCDE1234F1Z5',
      address:
        this.config.get<string>('SELLER_ADDRESS') ??
        '14, MG Road, Bengaluru, Karnataka 560001',
      state: this.config.get<string>('SELLER_STATE') ?? 'Karnataka',
    };

    const buyerState = (order.shippingAddress?.state ?? '').trim();
    const isInterState =
      buyerState.length > 0 &&
      buyerState.toLowerCase() !== seller.state.toLowerCase();

    // Net taxable value mirrors how tax was charged at order time:
    // (subtotal − discount). Each line's contribution is proportional.
    const taxableTotal = Math.max(0, order.subtotal - order.discount);
    const taxTotal = order.tax;

    const lines: GstLine[] = order.items.map((item, idx) => {
      const lineSubtotal = round2(item.price * item.quantity);
      const lineTaxable =
        taxableTotal > 0
          ? round2((lineSubtotal / order.subtotal) * taxableTotal)
          : 0;
      const lineTax =
        taxTotal > 0 ? round2((lineSubtotal / order.subtotal) * taxTotal) : 0;
      const cgst = isInterState ? 0 : round2(lineTax / 2);
      const sgst = isInterState ? 0 : round2(lineTax - cgst);
      const igst = isInterState ? round2(lineTax) : 0;
      return {
        sl: idx + 1,
        description: item.name,
        hsn: HSN_DEFAULT,
        quantity: item.quantity,
        unitPrice: round2(item.price),
        taxable: lineTaxable,
        cgst,
        sgst,
        igst,
        total: round2(lineTaxable + cgst + sgst + igst),
      };
    });

    const cgst = lines.reduce((n, l) => n + l.cgst, 0);
    const sgst = lines.reduce((n, l) => n + l.sgst, 0);
    const igst = lines.reduce((n, l) => n + l.igst, 0);

    // Use the persisted total/payable to stay faithful to what was
    // actually billed (rounding-safe across line subtotals).
    const grandTotal = round2(order.total);
    const payable = round2(order.payable ?? order.total);

    return {
      invoiceNumber: order.invoice?.number ?? 'DRAFT',
      orderNumber: order.orderNumber,
      issuedAt: order.invoice?.issuedAt ?? new Date(),
      paymentMethod: order.paymentMethod,
      isInterState,

      seller,
      buyer: {
        name: order.shippingAddress.fullName,
        address: [
          order.shippingAddress.line1,
          order.shippingAddress.line2,
          order.shippingAddress.city,
          order.shippingAddress.state,
          order.shippingAddress.zip,
          order.shippingAddress.country,
        ]
          .filter(Boolean)
          .join(', '),
        state: buyerState,
        phone: order.shippingAddress.phone,
        email: order.shippingAddress.email,
      },

      lines,
      totals: {
        taxable: round2(taxableTotal),
        cgst: round2(cgst),
        sgst: round2(sgst),
        igst: round2(igst),
        discount: round2(order.discount),
        shippingFee: round2(order.shippingFee),
        codFee: round2(order.codFee),
        walletAmount: round2(order.walletAmount ?? 0),
        grandTotal,
        payable,
        inWords: rupeesInWords(grandTotal),
        currency: 'INR',
      },
    };
  }

  /** Renders the invoice as a print-ready HTML document. */
  toHtml(inv: GstInvoice): string {
    const rows = inv.lines
      .map(
        (l) => `
          <tr>
            <td>${l.sl}</td>
            <td>${escapeHtml(l.description)}</td>
            <td>${l.hsn}</td>
            <td class="num">${l.quantity}</td>
            <td class="num">${money(l.unitPrice)}</td>
            <td class="num">${money(l.taxable)}</td>
            ${inv.isInterState
              ? `<td class="num">${money(l.igst)}</td>`
              : `<td class="num">${money(l.cgst)}</td><td class="num">${money(l.sgst)}</td>`}
            <td class="num">${money(l.total)}</td>
          </tr>`,
      )
      .join('');

    const taxHeader = inv.isInterState
      ? '<th>IGST</th>'
      : '<th>CGST</th><th>SGST</th>';

    return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>Invoice ${inv.invoiceNumber}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #18181B; padding: 32px; max-width: 760px; margin: 0 auto;
    background: #fff; line-height: 1.45;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #71717A; font-size: 12px; }
  .row { display: flex; justify-content: space-between; gap: 24px; }
  .card {
    border: 1px solid #E4E4E7; border-radius: 12px;
    padding: 16px; margin-top: 16px;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #E4E4E7; text-align: left; }
  th { background: #FAFAFA; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #52525B; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-top: 16px; margin-left: auto; width: 360px; }
  .totals .line { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals .grand { border-top: 1px solid #18181B; margin-top: 8px; padding-top: 8px; font-weight: 700; font-size: 16px; }
  .footer { margin-top: 32px; font-size: 11px; color: #71717A; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #F5F2EC; color: #18181B; }
  .stamp { color: #10B981; font-weight: 700; }
</style>
</head><body>
  <div class="row">
    <div>
      <h1>${escapeHtml(inv.seller.name)}</h1>
      <div class="muted">${escapeHtml(inv.seller.address)}</div>
      <div class="muted">GSTIN: ${inv.seller.gstin}</div>
    </div>
    <div style="text-align: right">
      <h1>Tax Invoice</h1>
      <div class="muted">${inv.invoiceNumber}</div>
      <div class="muted">${inv.issuedAt.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: '2-digit' })}</div>
      <div style="margin-top:6px"><span class="tag">${escapeHtml(inv.paymentMethod.toUpperCase())}</span></div>
    </div>
  </div>

  <div class="card">
    <div class="row">
      <div style="flex: 1">
        <div class="muted" style="text-transform: uppercase; letter-spacing: .08em; font-size: 11px">Bill to</div>
        <div style="margin-top: 4px"><strong>${escapeHtml(inv.buyer.name)}</strong></div>
        <div class="muted">${escapeHtml(inv.buyer.address)}</div>
        <div class="muted">${escapeHtml(inv.buyer.phone)}${inv.buyer.email ? ' · ' + escapeHtml(inv.buyer.email) : ''}</div>
        ${inv.buyer.gstin ? `<div class="muted">GSTIN: ${escapeHtml(inv.buyer.gstin)}</div>` : ''}
      </div>
      <div style="text-align: right; flex: 0 0 200px">
        <div class="muted" style="text-transform: uppercase; letter-spacing: .08em; font-size: 11px">Order</div>
        <div style="margin-top: 4px"><strong>${escapeHtml(inv.orderNumber)}</strong></div>
        <div class="muted">${inv.isInterState ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item</th>
        <th>HSN</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Taxable</th>
        ${taxHeader}
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="line"><span>Taxable value</span><span>${money(inv.totals.taxable)}</span></div>
    ${inv.totals.discount > 0 ? `<div class="line"><span>Discount</span><span>−${money(inv.totals.discount)}</span></div>` : ''}
    ${inv.isInterState
      ? `<div class="line"><span>IGST (8%)</span><span>${money(inv.totals.igst)}</span></div>`
      : `<div class="line"><span>CGST (4%)</span><span>${money(inv.totals.cgst)}</span></div>
         <div class="line"><span>SGST (4%)</span><span>${money(inv.totals.sgst)}</span></div>`}
    <div class="line"><span>Shipping</span><span>${inv.totals.shippingFee === 0 ? 'Free' : money(inv.totals.shippingFee)}</span></div>
    ${inv.totals.codFee > 0 ? `<div class="line"><span>COD handling</span><span>${money(inv.totals.codFee)}</span></div>` : ''}
    ${inv.totals.walletAmount > 0 ? `<div class="line"><span>Wallet applied</span><span>−${money(inv.totals.walletAmount)}</span></div>` : ''}
    <div class="line grand"><span>Total</span><span>${money(inv.totals.grandTotal)}</span></div>
    ${inv.totals.payable !== inv.totals.grandTotal
      ? `<div class="line"><span>Amount paid (wallet + ${inv.paymentMethod})</span><span>${money(inv.totals.grandTotal)}</span></div>`
      : ''}
  </div>

  <div class="card">
    <div class="muted" style="font-size: 11px">Amount in words</div>
    <div>${escapeHtml(inv.totals.inWords)}</div>
  </div>

  <div class="footer">
    This is a system-generated tax invoice. ${inv.isInterState ? 'IGST charged because billing state differs from seller state.' : 'CGST + SGST charged for intra-state supply.'}
  </div>
</body></html>`;
  }
}

// --- helpers --------------------------------------------------------------

function money(n: number): string {
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty',
  'ninety',
];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [
    h ? `${ONES[h]} hundred` : '',
    r ? below100(r) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Indian-numbering "amount in words" (lakh + crore, not thousand+million).
 * Handles paise via the decimal portion. Returns capitalized output.
 */
export function rupeesInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  function chunk(n: number): string {
    if (n === 0) return 'zero';
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    return [
      crore ? `${below100(crore)} crore` : '',
      lakh ? `${below100(lakh)} lakh` : '',
      thousand ? `${below100(thousand)} thousand` : '',
      rest ? below1000(rest) : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const rupPart = `Rupees ${chunk(rupees)}`;
  const paisePart = paise > 0 ? ` and ${below100(paise)} paise` : '';
  const text = `${rupPart}${paisePart} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
