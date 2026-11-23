import { ClockCircleOutlined, EnvironmentOutlined, IdcardOutlined, SwapRightOutlined, TagOutlined, TeamOutlined, WomanOutlined } from '@ant-design/icons';
import { Alert, Form, Input, InputNumber, Result, Select, Spin, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { BookingSteps } from '../components/BookingSteps';
import { mmss, useCountdown } from '../components/useCountdown';
import { addMinutes, fmtDate, fmtTime, mapsLink, money } from '../format';
import type { Booking, CheckoutDraft, Gender, SavedPassenger, TripDetail } from '../types';

function readDraft(state: unknown): CheckoutDraft | null {
  if (state && typeof state === 'object' && 'tripId' in state) return state as CheckoutDraft;
  try {
    const raw = sessionStorage.getItem('dvx_checkout');
    return raw ? (JSON.parse(raw) as CheckoutDraft) : null;
  } catch {
    return null;
  }
}

interface FormValues {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  passengers: { name?: string; gender?: Gender; age?: number }[];
}

export function Checkout() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, ready, requireLogin } = useAuth();
  const draft = useMemo(() => readDraft(loc.state), [loc.state]);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [saved, setSaved] = useState<SavedPassenger[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<{ code: string; discount: number; description: string | null } | null>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();
  const left = useCountdown(draft?.expiresAt ?? null);

  useEffect(() => {
    if (draft) api<TripDetail>(`/trips/${draft.tripId}`).then(setTrip).catch(() => setError('Không tải được thông tin chuyến'));
  }, [draft?.tripId]);

  useEffect(() => {
    if (!user && ready) requireLogin();
    if (user) api<SavedPassenger[]>('/auth/me/passengers').then(setSaved).catch(() => undefined);
  }, [user, ready]);

  useEffect(() => {
    if (user && trip && draft) {
      form.setFieldsValue({
        contactName: user.fullName,
        contactPhone: user.phone,
        contactEmail: user.email,
        passengers: draft.seatIds.map((_, i) => (i === 0 ? { name: user.fullName, gender: draft.femaleOnly[i] ? 'FEMALE' : undefined } : { gender: draft.femaleOnly[i] ? 'FEMALE' : undefined })),
      });
    }
  }, [user, trip]);

  if (!draft) {
    return (
      <Result status="info" title="Bạn chưa chọn ghế" subTitle="Hãy tìm chuyến và chọn ghế trước." extra={<Link className="btn-primary" to="/">Tìm chuyến</Link>} />
    );
  }
  if (!trip) return <div className="container section">{error ? <Alert type="error" message={error} /> : <Spin />}</div>;

  const pickup = trip.route.stops.find((s) => s.id === draft.pickupStopId);
  const dropoff = trip.route.stops.find((s) => s.id === draft.dropoffStopId);
  const subtotal = (draft.prices ?? draft.seatIds.map(() => trip.basePrice)).reduce((a, b) => a + b, 0);
  const total = subtotal - (applied?.discount ?? 0);
  const expired = left === 0;

  const applyCoupon = async () => {
    setCouponErr(null);
    if (!coupon.trim()) return;
    try {
      const r = await api<{ code: string; discount: number; description: string | null }>('/coupons/check', { method: 'POST', body: { code: coupon.trim(), amount: subtotal } });
      setApplied(r);
    } catch (e) {
      setApplied(null);
      setCouponErr(e instanceof ApiError ? e.message : 'Mã không hợp lệ');
    }
  };

  const fillSaved = (i: number, id: number) => {
    const p = saved.find((x) => x.id === id);
    if (!p) return;
    const list = [...(form.getFieldValue('passengers') ?? [])];
    list[i] = { name: p.fullName, gender: p.gender ?? undefined, age: p.age ?? undefined };
    form.setFieldValue('passengers', list);
  };

  const submit = async (v: FormValues) => {
    if (!requireLogin()) return;
    setSubmitting(true);
    setError(null);
    try {
      const b = await api<Booking>('/bookings', {
        method: 'POST',
        body: {
          tripId: draft.tripId,
          seatIds: draft.seatIds,
          pickupStopId: draft.pickupStopId,
          dropoffStopId: draft.dropoffStopId,
          contactName: v.contactName,
          contactPhone: v.contactPhone,
          contactEmail: v.contactEmail,
          passengers: draft.seatIds.map((_, i) => ({ name: v.passengers?.[i]?.name || v.contactName, gender: v.passengers?.[i]?.gender, age: v.passengers?.[i]?.age })),
          couponCode: applied?.code,
        },
      });
      const p = await api<{ txnRef: string; amount: number; paymentUrl: string; provider: string }>('/payments', { method: 'POST', body: { bookingCode: b.code } });
      try {
        sessionStorage.removeItem('dvx_checkout');
      } catch {
        /* bỏ qua */
      }
      if (p.provider === 'vnpay') window.location.href = p.paymentUrl;
      else nav(`/thanh-toan?${new URLSearchParams({ txnRef: p.txnRef, amount: String(p.amount), code: b.code })}`);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.code === 'SEAT_NOT_HELD' || err?.code === 'SEAT_TAKEN') setError(`${err.message}. Quay lại trang tìm chuyến để chọn ghế khác.`);
      else setError(err?.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container section checkout">
      <BookingSteps current={1} />
      <div className="checkout-grid">
        <section className="card">
          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} disabled={expired}>
            <h2 className="sec-h">
              <IdcardOutlined /> Thông tin liên hệ
            </h2>
            <Form.Item name="contactName" label="Họ tên người liên hệ" rules={[{ required: true, min: 2, message: 'Nhập họ tên' }]}>
              <Input id="contact-name" autoComplete="name" />
            </Form.Item>
            <div className="two-col">
              <Form.Item name="contactPhone" label="Số điện thoại" rules={[{ required: true, pattern: /^0\d{9}$/, message: 'Gồm 10 số, bắt đầu bằng 0' }]}>
                <Input id="contact-phone" autoComplete="tel" />
              </Form.Item>
              <Form.Item name="contactEmail" label="Email" rules={[{ required: true, type: 'email', message: 'Email không hợp lệ' }]}>
                <Input id="contact-email" autoComplete="email" />
              </Form.Item>
            </div>
            <p className="info-note">Vé điện tử và mã QR sẽ được gửi qua email này.</p>

            <h2 className="sec-h">
              <TeamOutlined /> Thông tin hành khách
            </h2>
            {draft.seatCodes.map((code, i) => (
              <div className="pax" key={code}>
                <div className="pax-head">
                  <Tag color={draft.femaleOnly?.[i] ? 'magenta' : 'green'}>
                    {draft.femaleOnly?.[i] && <WomanOutlined />} Ghế {code}
                  </Tag>
                  {draft.femaleOnly?.[i] && <span className="muted">Ghế dành cho nữ</span>}
                  {saved.length > 0 && (
                    <Select size="small" placeholder="Chọn hành khách thường đi" style={{ minWidth: 210 }} onChange={(id: number) => fillSaved(i, id)} options={saved.map((p) => ({ value: p.id, label: p.fullName }))} />
                  )}
                </div>
                <div className="pax-grid">
                  <Form.Item name={['passengers', i, 'name']} label="Họ tên">
                    <Input id={`pax-name-${code}`} placeholder="Bỏ trống thì dùng tên người liên hệ" />
                  </Form.Item>
                  <Form.Item
                    name={['passengers', i, 'gender']}
                    label="Giới tính"
                    rules={draft.femaleOnly?.[i] ? [{ validator: (_, v) => (v === 'FEMALE' ? Promise.resolve() : Promise.reject(new Error('Ghế dành cho nữ'))) }] : []}
                  >
                    <Select id={`pax-gender-${code}`} allowClear options={[{ value: 'MALE', label: 'Nam' }, { value: 'FEMALE', label: 'Nữ' }, { value: 'OTHER', label: 'Khác' }]} />
                  </Form.Item>
                  <Form.Item name={['passengers', i, 'age']} label="Tuổi">
                    <InputNumber id={`pax-age-${code}`} min={0} max={120} style={{ width: '100%' }} />
                  </Form.Item>
                </div>
              </div>
            ))}

            {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
            {expired && <Alert type="warning" message="Đã hết thời gian giữ ghế. Hãy quay lại chọn ghế." showIcon style={{ marginBottom: 16 }} />}
            <button className="btn-primary btn-block" type="submit" disabled={submitting || expired}>
              {submitting ? 'Đang tạo đơn…' : `Thanh toán ${money(total)}`}
            </button>
            <p className="hint">Bấm thanh toán nghĩa là bạn đồng ý với chính sách hủy, đổi vé ở cuối trang.</p>
          </Form>
        </section>

        <aside className="card summary">
          {left !== null && (
            <div className={`sum-hold ${left < 60 ? 'urgent' : ''}`}>
              <ClockCircleOutlined /> Ghế được giữ cho bạn trong <b>{mmss(left)}</b>
            </div>
          )}
          <h3>{trip.bus.busType}</h3>
          <p className="sum-route">
            {trip.route.originCity} <SwapRightOutlined /> {trip.route.destinationCity}
          </p>
          <p>
            {fmtDate(trip.departAt)} · <b>{fmtTime(trip.departAt)}</b>
          </p>
          <p>{trip.bus.busType}</p>
          <div className="sum-block">
            <span>Ghế</span>
            <div>
              {draft.seatCodes.map((c, i) => (
                <Tag key={c} color={draft.femaleOnly?.[i] ? 'magenta' : 'green'}>
                  {c} · {money(draft.prices?.[i] ?? trip.basePrice)}
                </Tag>
              ))}
            </div>
          </div>
          {pickup && (
            <div className="sum-block">
              <span>
                <EnvironmentOutlined /> Đón lúc {fmtTime(addMinutes(trip.departAt, pickup.offsetMinutes))}
              </span>
              <div>
                {pickup.name}
                <small>
                  {pickup.address} · <a href={mapsLink(pickup)} target="_blank" rel="noreferrer">Bản đồ</a>
                </small>
              </div>
            </div>
          )}
          {dropoff && (
            <div className="sum-block">
              <span>
                <EnvironmentOutlined /> Trả
              </span>
              <div>
                {dropoff.name}
                <small>{dropoff.address}</small>
              </div>
            </div>
          )}
          <div className="sum-block">
            <span>
              <TagOutlined /> Mã giảm giá
            </span>
            <div className="coupon">
              <Input id="coupon-code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Ví dụ GIAM10" onPressEnter={applyCoupon} />
              <button type="button" className="btn-outline" onClick={applyCoupon}>
                Áp dụng
              </button>
            </div>
            {applied && (
              <small className="ok">
                Đã áp dụng {applied.code}: −{money(applied.discount)}{' '}
                <button className="link" onClick={() => { setApplied(null); setCoupon(''); }}>Bỏ</button>
              </small>
            )}
            {couponErr && <small className="err">{couponErr}</small>}
          </div>
          <div className="sum-line">
            <span>Tạm tính</span>
            <span>{money(subtotal)}</span>
          </div>
          {applied && (
            <div className="sum-line">
              <span>Giảm giá</span>
              <span>−{money(applied.discount)}</span>
            </div>
          )}
          <div className="sum-total">
            <span>Tổng cộng</span>
            <b>{money(total)}</b>
          </div>
        </aside>
      </div>
    </div>
  );
}
