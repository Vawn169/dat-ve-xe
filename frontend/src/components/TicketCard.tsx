import { CarOutlined, EnvironmentOutlined, QrcodeOutlined } from '@ant-design/icons';
import { Rate, Tag } from 'antd';
import QRCode from 'qrcode';
import { useEffect, useState, type ReactNode } from 'react';
import { GENDER, STATUS, duration, fmtDate, fmtTime, mapsLink, money } from '../format';
import type { Booking } from '../types';
import { TripTracker } from './TripTracker';

/** Mã QR trên vé (F14) – nhân viên quét khi khách lên xe (F24) */
export function TicketQr({ code, size = 150 }: { code: string; size?: number }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    QRCode.toDataURL(`DVX|${code}`, { margin: 1, width: size * 2 }).then(setSrc).catch(() => undefined);
  }, [code, size]);
  return src ? <img src={src} width={size} height={size} alt={`Mã QR vé ${code}`} className="qr" /> : null;
}

export function TicketCard({ b, actions }: { b: Booking; actions?: ReactNode }) {
  const st = STATUS[b.status];
  const [showQr, setShowQr] = useState(false);
  const [track, setTrack] = useState(false);
  const checked = b.seats.length > 0 && b.seats.every((s) => s.checkedIn);
  return (
    <article className="ticket">
      <div className="ticket-head">
        <div>
          <span className="ticket-code">{b.code}</span>
          <Tag color={st.color}>{st.label}</Tag>
          {b.channel === 'COUNTER' && <Tag>Mua tại quầy</Tag>}
          {b.changedFromTripId && <Tag color="blue">Đã đổi chuyến</Tag>}
          {checked && <Tag color="cyan">Đã lên xe</Tag>}
        </div>
        <span className="ticket-date">{fmtDate(b.trip.departAt)}</span>
      </div>
      <div className="ticket-body">
        <div>
          <div className="ticket-route">
            <div>
              <b>{fmtTime(b.trip.departAt)}</b>
              <span>{b.trip.originCity}</span>
            </div>
            <div className="ticket-line">
              <small>{duration(b.trip.departAt, b.trip.arriveAt)}</small>
            </div>
            <div>
              <b>{fmtTime(b.trip.arriveAt)}</b>
              <span>{b.trip.destinationCity}</span>
            </div>
          </div>
          {b.status === 'PAID' && (
            <div className="qr-box">
              {showQr ? (
                <>
                  <TicketQr code={b.code} />
                  <small>Đưa mã này cho nhân viên khi lên xe</small>
                </>
              ) : (
                <button className="link" onClick={() => setShowQr(true)}>
                  <QrcodeOutlined /> Hiện mã QR lên xe
                </button>
              )}
              <button className="btn-outline tt-open" onClick={() => setTrack(true)}>
                <CarOutlined /> Theo dõi chuyến xe
              </button>
              {track && <TripTracker b={b} open={track} onClose={() => setTrack(false)} />}
            </div>
          )}
        </div>
        <dl className="ticket-info">
          <dt>Xe</dt>
          <dd>
            {b.trip.busType} · {b.trip.plateNumber}
          </dd>
          <dt>Ghế</dt>
          <dd>
            {b.seats.map((s) => (
              <Tag key={s.seatId}>
                {s.code}
                {s.passengerName ? ` – ${s.passengerName}` : ''}
                {s.gender ? ` (${GENDER[s.gender]})` : ''}
              </Tag>
            ))}
          </dd>
          <dt>
            <EnvironmentOutlined /> Đón
          </dt>
          <dd>
            {b.pickupStop.name} <small>{b.pickupStop.address} · <a href={mapsLink(b.pickupStop)} target="_blank" rel="noreferrer">Bản đồ</a></small>
          </dd>
          <dt>
            <EnvironmentOutlined /> Trả
          </dt>
          <dd>
            {b.dropoffStop.name} <small>{b.dropoffStop.address}</small>
          </dd>
          <dt>Liên hệ</dt>
          <dd>
            {b.contactName} · {b.contactPhone}
          </dd>
          <dt>Tổng tiền</dt>
          <dd>
            <b className="price">{money(b.totalAmount)}</b>
            {b.discountAmount > 0 && <span className="muted"> (đã giảm {money(b.discountAmount)}{b.couponCode ? ` – mã ${b.couponCode}` : ''})</span>}
            {b.refundAmount != null && <span className="refund"> · Hoàn lại {money(b.refundAmount)}</span>}
          </dd>
          {b.review && (
            <>
              <dt>Đánh giá</dt>
              <dd>
                <Rate disabled value={b.review.rating} /> {b.review.comment}
              </dd>
            </>
          )}
        </dl>
      </div>
      {actions && <div className="ticket-actions">{actions}</div>}
    </article>
  );
}
