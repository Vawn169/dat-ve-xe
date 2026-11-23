import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Empty, Result, Skeleton, Steps } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { SeatSelector } from '../components/SeatSelector';
import { addDays, fmtDate, fmtTime, fmtYmd, money, vnToday } from '../format';
import { message } from '../notify';
import type { Booking, PickedSeats, TripSummary } from '../types';

/** F19: đổi sang chuyến khác cùng tuyến (quy tắc mẫu: trước giờ chạy 12 giờ, chỗ cùng giá hoặc rẻ hơn) */
export function ChangeTrip() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const { user, ready, requireLogin } = useAuth();
  const [b, setB] = useState<Booking | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      if (ready) requireLogin();
      return;
    }
    api<Booking>(`/bookings/${code}`)
      .then((x) => {
        setB(x);
        setDate(new Date(new Date(x.trip.departAt).getTime() + 7 * 3600e3).toISOString().slice(0, 10));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được vé'));
  }, [code, user, ready]);

  useEffect(() => {
    if (!b || !date) return;
    setTrips(null);
    setOpenId(null);
    api<TripSummary[]>(`/trips?${new URLSearchParams({ from: b.trip.originCity, to: b.trip.destinationCity, date })}`)
      // Chỉ đổi sang chuyến cùng tuyến (cùng nhà xe), server cũng kiểm tra lại
      .then((t) => setTrips(t.filter((x) => x.id !== b.trip.id && x.routeId === b.trip.routeId)))
      .catch(() => setTrips([]));
  }, [b, date]);

  const confirm = async (p: PickedSeats) => {
    setSaving(true);
    setError(null);
    try {
      await api(`/bookings/${code}/change`, { method: 'POST', body: { tripId: p.tripId, seatIds: p.seatIds } });
      message.success('Đổi chuyến thành công. Vé mới đã được gửi qua email.');
      nav('/ve-cua-toi');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không đổi được chuyến');
    } finally {
      setSaving(false);
    }
  };

  if (error && !b) return <Result status="warning" title={error} extra={<Link className="btn-primary" to="/ve-cua-toi">Về vé của tôi</Link>} />;
  if (!b || !date) return <div className="container section"><Skeleton active /></div>;
  if (!b.canChange) {
    return <Result status="info" title="Vé này không đổi được" subTitle="Chỉ đổi được vé đã thanh toán, trước giờ khởi hành ít nhất 12 giờ." extra={<Link className="btn-primary" to="/ve-cua-toi">Về vé của tôi</Link>} />;
  }

  return (
    <div className="container section">
      <Steps size="small" current={1} items={[{ title: 'Chọn vé cần đổi' }, { title: 'Chọn chuyến và ghế mới' }, { title: 'Xác nhận' }]} className="steps" />
      <div className="card change-head">
        <h2>Đổi vé {b.code}</h2>
        <p>
          Chuyến hiện tại: <b>{fmtTime(b.trip.departAt)}</b> {fmtDate(b.trip.departAt)} · {b.trip.originCity} → {b.trip.destinationCity} · Ghế {b.seats.map((s) => s.code).join(', ')} · {money(b.totalAmount)}
        </p>
        <p className="muted">Quy tắc: đổi miễn phí sang chuyến cùng tuyến, cần chọn đúng {b.seats.length} ghế, chỗ mới cùng giá hoặc rẻ hơn (phần chênh lệch được hoàn).</p>
      </div>
      <div className="date-nav">
        <button disabled={date <= vnToday()} onClick={() => setDate(addDays(date, -1))}>
          <LeftOutlined /> Ngày trước
        </button>
        <b>{fmtYmd(date)}</b>
        <button onClick={() => setDate(addDays(date, 1))}>
          Ngày sau <RightOutlined />
        </button>
      </div>
      {error && <Alert type="error" showIcon message={error} style={{ margin: '12px 0' }} />}
      {!trips && <Skeleton active />}
      {trips && !trips.length && <Empty description="Không có chuyến khác trong ngày này" />}
      {trips?.map((t) => (
        <article key={t.id} className={`trip-card ${openId === t.id ? 'open' : ''}`}>
          <div className="trip-main">
            <div className="trip-op">
              <h3>{fmtTime(t.departAt)} → {fmtTime(t.arriveAt)}</h3>
              <span className="muted">{t.busType}</span>
            </div>
            <div />
            <div className="trip-price">
              <b>{money(t.basePrice)}</b>
              <span className="seats-left">Còn {t.availableSeats} chỗ</span>
              <button className={openId === t.id ? 'btn-outline' : 'btn-primary'} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                {openId === t.id ? 'Đóng' : 'Chọn ghế'}
              </button>
            </div>
          </div>
          {openId === t.id && (
            <SeatSelector tripId={t.id} busType={t.busType} departAt={t.departAt} mode="change" exactCount={b.seats.length} continueLabel={saving ? 'Đang đổi…' : 'Xác nhận đổi chuyến'} onContinue={confirm} />
          )}
        </article>
      ))}
    </div>
  );
}
