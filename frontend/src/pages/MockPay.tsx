import { CheckCircleFilled, CopyOutlined, CreditCardOutlined, ExperimentOutlined, LockOutlined, QrcodeOutlined, SafetyCertificateOutlined, WalletOutlined } from '@ant-design/icons';
import { Alert, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { BookingSteps } from '../components/BookingSteps';
import { TicketQr } from '../components/TicketCard';
import { duration, fmtDate, fmtTime, money } from '../format';
import { message } from '../notify';
import type { Booking } from '../types';

/** Các cổng sẽ có khi tích hợp thật; bản đồ án chỉ bật cổng giả lập. */
const METHODS = [
  { key: 'mock', icon: <ExperimentOutlined />, title: 'Cổng thanh toán giả lập', text: 'Dùng để chạy thử trong lúc phát triển', on: true },
  { key: 'vnpay', icon: <QrcodeOutlined />, title: 'VNPay – quét mã QR ngân hàng', text: 'Cần tài khoản VNPay sandbox', on: false },
  { key: 'atm', icon: <CreditCardOutlined />, title: 'Thẻ ATM nội địa / Internet Banking', text: 'Qua cổng VNPay', on: false },
  { key: 'wallet', icon: <WalletOutlined />, title: 'Ví điện tử', text: 'Chưa tích hợp trong đồ án', on: false },
];

/** Trang cổng thanh toán GIẢ LẬP (khi chưa có VNPay sandbox). Cổng thật sẽ là trang của VNPay. */
export function MockPay() {
  const [params] = useSearchParams();
  const txnRef = params.get('txnRef') ?? '';
  const amount = params.get('amount') ?? '0';
  const code = params.get('code') ?? '';
  const [state, setState] = useState<'idle' | 'paying' | 'paid' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  // Thông tin đơn để hiện tóm tắt (cần đăng nhập; không lấy được thì chỉ hiện mã và số tiền).
  useEffect(() => {
    api<Booking[]>('/bookings/me')
      .then((bs) => setBooking(bs.find((b) => b.code === code) ?? null))
      .catch(() => undefined);
  }, [code, state]);

  const pay = async (result: 'success' | 'fail') => {
    setState('paying');
    setError(null);
    try {
      const r = await api<{ bookingStatus?: string; paymentStatus: string }>(
        `/payments/mock/pay?${new URLSearchParams({ txnRef, amount, result })}`,
      );
      if (r.bookingStatus === 'PAID') setState('paid');
      else if (r.bookingStatus === 'NEEDS_REFUND') {
        setState('failed');
        setError('Thanh toán xong nhưng ghế không còn. Đơn đã chuyển sang chờ hoàn tiền.');
      } else setState('failed');
    } catch (e) {
      setState('idle');
      setError(e instanceof ApiError ? e.message : 'Có lỗi xảy ra');
    }
  };

  const copy = () =>
    navigator.clipboard?.writeText(code).then(
      () => message.success('Đã chép mã vé'),
      () => undefined,
    );

  if (state === 'paid') {
    return (
      <div className="container section pay-success">
        <div className="ps-head">
          <span className="ps-check">
            <CheckCircleFilled />
          </span>
          <Tag color="green">
            <SafetyCertificateOutlined /> Đã xác nhận
          </Tag>
          <h1>Đặt vé và thanh toán thành công!</h1>
          <p className="muted">
            Cảm ơn {booking?.contactName ?? 'bạn'}. Vé điện tử đã được gửi tới {booking?.contactEmail ?? 'email của bạn'}.
          </p>
          <div className="ps-code">
            <span>
              <small>Mã đặt vé / mã tra cứu</small>
              <b>{code}</b>
            </span>
            <button className="btn-ghost" onClick={copy}>
              <CopyOutlined /> Sao chép
            </button>
          </div>
        </div>

        <article className="eticket">
          <header>
            <b>{booking ? `${booking.trip.originCity} → ${booking.trip.destinationCity}` : `Đơn ${code}`}</b>
            {booking && (
              <span>
                {booking.trip.busType} · {booking.trip.plateNumber}
              </span>
            )}
          </header>
          <div className="et-body">
            <div className="et-main">
              {booking && (
                <>
                  <div className="et-times">
                    <div>
                      <b>{fmtTime(booking.trip.departAt)}</b>
                      <small>{fmtDate(booking.trip.departAt)}</small>
                      <span>{booking.pickupStop.name}</span>
                    </div>
                    <i>{duration(booking.trip.departAt, booking.trip.arriveAt)}</i>
                    <div className="to">
                      <b>{fmtTime(booking.trip.arriveAt)}</b>
                      <small>{fmtDate(booking.trip.arriveAt)}</small>
                      <span>{booking.dropoffStop.name}</span>
                    </div>
                  </div>
                  <div className="et-pax">
                    {booking.seats.map((s) => (
                      <span key={s.seatId}>
                        <b>{s.code}</b> {s.passengerName ?? booking.contactName}
                      </span>
                    ))}
                  </div>
                </>
              )}
              <div className="et-total">
                <span>Tổng thanh toán</span>
                <b>{money(booking?.totalAmount ?? Number(amount))}</b>
              </div>
            </div>
            <div className="et-qr">
              <small>Mã QR lên xe</small>
              <TicketQr code={code} size={140} />
              <small>Đưa mã này cho nhân viên khi lên xe</small>
            </div>
          </div>
          <footer>Vui lòng có mặt tại điểm đón trước 15 phút để nhân viên đối chiếu số ghế.</footer>
        </article>

        <div className="ps-actions">
          <Link className="btn-primary" to="/ve-cua-toi">
            Xem vé của tôi
          </Link>
          <Link className="btn-outline" to="/">
            Đặt thêm vé
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section pay checkout">
      <BookingSteps current={2} />
      <div className="checkout-grid">
        <section className="card pay-box">
          <h2 className="sec-h">
            <LockOutlined /> Chọn phương thức thanh toán
          </h2>
          <div className="pay-methods" role="radiogroup">
            {METHODS.map((m) => (
              <div key={m.key} className={`pay-method ${m.on ? 'on' : 'off'}`} role="radio" aria-checked={m.on} aria-disabled={!m.on}>
                <span className="pm-radio" />
                <span className="pm-icon">{m.icon}</span>
                <span className="pm-text">
                  <b>{m.title}</b>
                  <small>{m.text}</small>
                </span>
                {!m.on && <Tag>Chưa bật</Tag>}
              </div>
            ))}
          </div>
          <p className="info-note">
            Đây là trang thay thế cổng thanh toán thật trong lúc phát triển. Bấm một nút để giả lập kết quả mà cổng thanh toán gửi về.
          </p>
          {state === 'failed' && <Alert type="warning" showIcon message={error ?? 'Thanh toán không thành công. Bạn có thể thử lại trước khi đơn hết hạn.'} />}
          {error && state !== 'failed' && <Alert type="error" showIcon message={error} />}
        </section>

        <aside className="card summary">
          <h3>Đơn {code}</h3>
          {booking && (
            <>
              <p className="sum-route">
                {booking.trip.originCity} → {booking.trip.destinationCity}
              </p>
              <p>
                {fmtDate(booking.trip.departAt)} · <b>{fmtTime(booking.trip.departAt)}</b> · Ghế {booking.seats.map((s) => s.code).join(', ')}
              </p>
              {booking.discountAmount > 0 && (
                <div className="sum-line">
                  <span>Giảm giá{booking.couponCode ? ` (${booking.couponCode})` : ''}</span>
                  <span>−{money(booking.discountAmount)}</span>
                </div>
              )}
            </>
          )}
          <div className="sum-total">
            <span>Tổng thanh toán</span>
            <b className="pay-amount">{money(Number(amount))}</b>
          </div>
          <div className="pay-actions">
            <button className="btn-primary btn-block" disabled={state === 'paying'} onClick={() => pay('success')}>
              <LockOutlined /> {state === 'paying' ? 'Đang xử lý…' : 'Thanh toán thành công'}
            </button>
            <button className="btn-outline btn-block" disabled={state === 'paying'} onClick={() => pay('fail')}>
              Giả lập thất bại
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
