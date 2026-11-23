import type { BookingStatus } from './types';

// Mọi giờ hiển thị theo giờ Việt Nam, bất kể máy người xem đặt múi giờ nào.
const TZ = 'Asia/Ho_Chi_Minh';

export const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso));

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }).format(new Date(iso));

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD */
export const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "Thứ Sáu, 21/11/2026" từ YYYY-MM-DD */
export const fmtYmd = (ymd: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

export const duration = (from: string, to: string) => {
  const m = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} giờ ${m % 60} phút` : `${h} giờ`;
};

/** Giờ khởi hành (0–23) theo giờ Việt Nam */
export const hourVN = (iso: string) => (new Date(iso).getUTCHours() + 7) % 24;

export const addMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();

export const STATUS: Record<BookingStatus, { label: string; color: string }> = {
  PENDING_PAYMENT: { label: 'Chờ thanh toán', color: 'gold' },
  PAID: { label: 'Đã thanh toán', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
  EXPIRED: { label: 'Hết hạn thanh toán', color: 'default' },
  PAYMENT_FAILED: { label: 'Thanh toán lỗi', color: 'red' },
  NEEDS_REFUND: { label: 'Chờ hoàn tiền', color: 'volcano' },
};

export const GENDER: Record<string, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

/** Link mở vị trí điểm đón/trả trên Google Maps (F11) */
export const mapsLink = (s: { lat: number | null; lng: number | null; name: string; address: string }) =>
  s.lat != null && s.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address}`)}`;

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso));

/** "21/11/2026" theo giờ Việt Nam */
export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }).format(new Date(iso));
