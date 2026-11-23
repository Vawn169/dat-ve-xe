import * as path from 'path';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

/** Nội dung mã QR trên vé (nhân viên quét khi khách lên xe – F24) */
export const qrContent = (code: string) => `DVX|${code}`;
export const qrDataUrl = (code: string) => QRCode.toDataURL(qrContent(code), { margin: 1, width: 240 });

/** Lấy mã vé từ nội dung QR hoặc mã nhập tay */
export const parseTicketCode = (raw: string) => raw.trim().toUpperCase().replace(/^DVX\|/, '');

const TZ = 'Asia/Ho_Chi_Minh';
export const vnTime = (d: Date) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(d);
export const vnDate = (d: Date) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }).format(d);
export const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

export interface TicketView {
  code: string;
  status: string;
  totalAmount: number;
  discountAmount: number;
  contactName: string;
  contactPhone: string;
  trip: { departAt: Date; arriveAt: Date; originCity: string; destinationCity: string; busType: string; plateNumber: string };
  pickupStop: { name: string; address: string };
  dropoffStop: { name: string; address: string };
  seats: { code: string; passengerName: string | null; price: number }[];
}

export function ticketEmailHtml(t: TicketView): string {
  const seats = t.seats.map((s) => `${s.code}${s.passengerName ? ` (${s.passengerName})` : ''}`).join(', ');
  return `<p>Cảm ơn ${t.contactName} đã đặt vé. Vé của bạn đã được xác nhận.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="color:#5f6f6c;padding:4px 0">Mã vé</td><td><b style="font-size:18px;letter-spacing:2px">${t.code}</b></td></tr>
<tr><td style="color:#5f6f6c;padding:4px 0">Tuyến</td><td>${t.trip.originCity} → ${t.trip.destinationCity}</td></tr>
<tr><td style="color:#5f6f6c;padding:4px 0">Khởi hành</td><td><b>${vnTime(t.trip.departAt)}</b>, ${vnDate(t.trip.departAt)}</td></tr>
<tr><td style="color:#5f6f6c;padding:4px 0">Xe</td><td>${t.trip.busType} · ${t.trip.plateNumber}</td></tr>
<tr><td style="color:#5f6f6c;padding:4px 0">Ghế</td><td>${seats}</td></tr>
<tr><td style="color:#5f6f6c;padding:4px 0">Điểm đón</td><td>${t.pickupStop.name} – ${t.pickupStop.address}</td></tr>
<tr><td style="color:#5f6f6c;padding:4px 0">Điểm trả</td><td>${t.dropoffStop.name} – ${t.dropoffStop.address}</td></tr>
<tr><td style="color:#5f6f6c;padding:4px 0">Tổng tiền</td><td><b>${vnd(t.totalAmount)}</b>${t.discountAmount ? ` (đã giảm ${vnd(t.discountAmount)})` : ''}</td></tr>
</table>
<p style="text-align:center;margin:16px 0"><img src="cid:qr" width="180" height="180" alt="Mã QR vé ${t.code}"/><br/><small>Đưa mã QR này cho nhân viên khi lên xe</small></p>
<p style="color:#5f6f6c">Vui lòng có mặt tại điểm đón trước 30 phút. Hủy vé trước 24 giờ: phí 10%; từ 4–24 giờ: phí 30%.</p>`;
}

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');

/** Vé điện tử dạng PDF (F15). Dùng phông DejaVu để hiển thị đúng tiếng Việt. */
export async function renderTicketPdf(t: TicketView): Promise<Buffer> {
  const qr = await QRCode.toBuffer(qrContent(t.code), { margin: 1, width: 300 });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Vé ${t.code}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('r', path.join(FONT_DIR, 'DejaVuSans.ttf'));
    doc.registerFont('b', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));

    const W = doc.page.width - 72;
    doc.rect(0, 0, doc.page.width, 64).fill('#0b7a5e');
    doc.fill('#ffffff').font('b').fontSize(18).text('ĐặtVéXe · VÉ ĐIỆN TỬ', 36, 22);
    doc.fill('#1c2a28').font('b').fontSize(22).text(t.code, 36, 84, { characterSpacing: 2 });
    doc.font('r').fontSize(10).fill('#5f6f6c').text(`Trạng thái: ${t.status === 'PAID' ? 'Đã thanh toán' : t.status}`, 36, 112);
    doc.image(qr, 36 + W - 110, 76, { width: 110 });

    let y = 200;
    const row = (label: string, value: string, bold = false) => {
      doc.font('r').fontSize(10).fill('#5f6f6c').text(label, 36, y, { width: 90 });
      doc.font(bold ? 'b' : 'r').fontSize(11).fill('#1c2a28').text(value, 130, y, { width: W - 94 });
      y = doc.y + 8;
    };
    row('Tuyến', `${t.trip.originCity} → ${t.trip.destinationCity}`, true);
    row('Khởi hành', `${vnTime(t.trip.departAt)} · ${vnDate(t.trip.departAt)}`, true);
    row('Dự kiến đến', `${vnTime(t.trip.arriveAt)} · ${vnDate(t.trip.arriveAt)}`);
    row('Xe', `${t.trip.busType} · Biển số ${t.trip.plateNumber}`);
    row('Ghế', t.seats.map((s) => `${s.code}${s.passengerName ? ` – ${s.passengerName}` : ''}`).join('\n'), true);
    row('Điểm đón', `${t.pickupStop.name}\n${t.pickupStop.address}`);
    row('Điểm trả', `${t.dropoffStop.name}\n${t.dropoffStop.address}`);
    row('Người liên hệ', `${t.contactName} · ${t.contactPhone}`);
    row('Tổng tiền', `${vnd(t.totalAmount)}${t.discountAmount ? ` (đã giảm ${vnd(t.discountAmount)})` : ''}`, true);
    doc
      .font('r')
      .fontSize(9)
      .fill('#5f6f6c')
      .text('Có mặt tại điểm đón trước 30 phút và đưa mã QR cho nhân viên. Vé không chuyển nhượng. Dữ liệu trong đồ án là dữ liệu mẫu.', 36, y + 10, {
        width: W,
      });
    doc.end();
  });
}
