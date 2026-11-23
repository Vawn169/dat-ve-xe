import { CameraOutlined, CheckCircleOutlined, DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { Alert, DatePicker, Empty, Form, Input, Progress, Result, Select, Table, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, download } from '../api';
import { useAuth } from '../auth';
import { SeatSelector } from '../components/SeatSelector';
import { TicketCard, TicketQr } from '../components/TicketCard';
import { GENDER, fmtDateTime, fmtTime, money, vnToday } from '../format';
import { message } from '../notify';
import type { Booking, PickedSeats } from '../types';

export interface ManageTrip {
  id: number;
  routeId: number;
  busId: number;
  departAt: string;
  arriveAt: string;
  basePrice: number;
  status: 'SCHEDULED' | 'CANCELLED' | 'DEPARTED' | 'COMPLETED' | string;
  route: { originCity: string; destinationCity: string };
  bus: { busType: string; plateNumber: string };
  _count: { tripSeats: number };
  soldSeats: number;
  blockedSeats: number;
}

interface Manifest {
  trip: { id: number; departAt: string; originCity: string; destinationCity: string; busType: string; plateNumber: string };
  total: number;
  checkedIn: number;
  passengers: { itemId: number; code: string; seat: string; name: string | null; gender: string | null; phone: string; channel: string; pickup: string; dropoff: string; checkedInAt: string | null }[];
}

const errMsg = (e: unknown, d: string) => (e instanceof ApiError ? e.message : d);
export const tripLabel = (t: ManageTrip) => `${fmtTime(t.departAt)} · ${t.route.originCity} → ${t.route.destinationCity} · ${t.bus.busType} (${t.soldSeats}/${t._count.tripSeats})`;

export function useManageTrips(date: string) {
  const [trips, setTrips] = useState<ManageTrip[] | null>(null);
  const reload = () => {
    setTrips(null);
    api<ManageTrip[]>(`/trips/manage/list?date=${date}`).then(setTrips).catch(() => setTrips([]));
  };
  useEffect(reload, [date]);
  return { trips, reload };
}

/** F23, F24: quầy nhân viên – bán vé tại quầy, danh sách hành khách, soát vé lên xe */
export function Staff() {
  const { user, ready, requireLogin } = useAuth();
  useEffect(() => {
    if (!user && ready) requireLogin();
  }, [user, ready]);
  if (!user) return <Result status="403" title="Cần đăng nhập tài khoản nhân viên" subTitle="Tài khoản mẫu: staff@example.com / Matkhau@123" />;
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') return <Result status="403" title="Trang này dành cho nhân viên nhà xe" />;
  return (
    <div className="container section staff">
      <div className="page-head">
        <div>
          <h1>Quầy nhân viên</h1>
          <p className="muted">Bán vé trực tiếp cho khách tại quầy và soát vé khi khách lên xe.</p>
        </div>
      </div>
      <Tabs
        className="pill-tabs"
        destroyOnHidden
        items={[
          { key: 'sell', label: 'Bán vé tại quầy', children: <CounterSale /> },
          { key: 'check', label: 'Soát vé & danh sách hành khách', children: <CheckIn /> },
        ]}
      />
    </div>
  );
}

function CounterSale() {
  const [date, setDate] = useState(vnToday());
  const { trips, reload } = useManageTrips(date);
  const [tripId, setTripId] = useState<number | null>(null);
  const [picked, setPicked] = useState<PickedSeats | null>(null);
  const [done, setDone] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const trip = trips?.find((t) => t.id === tripId) ?? null;
  const bookable = (trips ?? []).filter((t) => t.status === 'SCHEDULED' && new Date(t.departAt).getTime() > Date.now());

  const sell = async (v: Record<string, string>) => {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const b = await api<Booking>('/staff/bookings', {
        method: 'POST',
        body: {
          tripId: picked.tripId,
          seatIds: picked.seatIds,
          pickupStopId: picked.pickupStopId,
          dropoffStopId: picked.dropoffStopId,
          contactName: v.contactName,
          contactPhone: v.contactPhone,
          contactEmail: v.contactEmail || undefined,
          passengers: picked.seatIds.map((_, i) => ({ name: v[`name${i}`] || v.contactName, gender: v[`gender${i}`] || undefined })),
        },
      });
      setDone(b);
      setPicked(null);
      form.resetFields();
      reload();
      message.success(`Đã bán vé ${b.code} – thu tiền mặt ${money(b.totalAmount)}`);
    } catch (e) {
      setError(errMsg(e, 'Không bán được vé'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="counter-done">
        <div className="print-area">
          <TicketCard b={done} />
          <div className="print-qr">
            <TicketQr code={done.code} size={130} />
          </div>
        </div>
        <div className="ticket-actions">
          <button className="btn-primary" onClick={() => window.print()}>
            <PrinterOutlined /> In vé
          </button>
          <button className="btn-outline" onClick={() => download(`/bookings/${done.code}/pdf`, `ve-${done.code}.pdf`).catch((e) => message.error(errMsg(e, 'Không tải được')))}>
            <DownloadOutlined /> Tải PDF
          </button>
          <button className="btn-ghost" onClick={() => setDone(null)}>
            Bán vé tiếp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <DatePicker id="counter-date" value={dayjs(date)} allowClear={false} onChange={(d) => d && (setDate(d.format('YYYY-MM-DD')), setTripId(null), setPicked(null))} format="DD/MM/YYYY" />
        <Select
          id="counter-trip"
          style={{ minWidth: 360, flex: 1 }}
          placeholder="Chọn chuyến"
          loading={!trips}
          value={tripId ?? undefined}
          onChange={(v) => {
            setTripId(v);
            setPicked(null);
          }}
          options={bookable.map((t) => ({ value: t.id, label: tripLabel(t) }))}
          notFoundContent="Không còn chuyến bán được trong ngày"
        />
      </div>
      {!trip && <Empty description="Chọn ngày và chuyến để bán vé" />}
      {trip && !picked && <SeatSelector key={trip.id} tripId={trip.id} busType={trip.bus.busType} departAt={trip.departAt} mode="counter" onContinue={setPicked} />}
      {(
        <section className="card" hidden={!(trip && picked)}>
          <h3>
            Thông tin khách · ghế {picked?.seatCodes.join(', ')} · {money(picked?.prices.reduce((a, b) => a + b, 0) ?? 0)}
          </h3>
          <Form form={form} layout="vertical" onFinish={sell} requiredMark={false}>
            <div className="two-col">
              <Form.Item name="contactName" label="Họ tên người mua" rules={[{ required: true, min: 2, message: 'Nhập họ tên' }]}>
                <Input id="c-name" />
              </Form.Item>
              <Form.Item name="contactPhone" label="Số điện thoại" rules={[{ required: true, pattern: /^0\d{9}$/, message: 'Số điện thoại 10 số' }]}>
                <Input id="c-phone" />
              </Form.Item>
            </div>
            <Form.Item name="contactEmail" label="Email (nếu khách muốn nhận vé điện tử)" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
              <Input id="c-email" />
            </Form.Item>
            {picked?.seatCodes.map((code, i) => (
              <div className="pax-grid" key={code}>
                <b className="pax-seat">{code}</b>
                <Form.Item name={`name${i}`} label="Tên hành khách">
                  <Input id={`c-pax-${i}`} placeholder="Để trống = người mua" />
                </Form.Item>
                <Form.Item name={`gender${i}`} label="Giới tính" rules={picked.femaleOnly[i] ? [{ required: true, enum: ['FEMALE'], type: 'enum', message: 'Ghế dành cho nữ' }] : []}>
                  <Select id={`c-gender-${i}`} allowClear options={Object.entries(GENDER).map(([value, label]) => ({ value, label }))} />
                </Form.Item>
              </div>
            ))}
            {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
            <div className="ticket-actions">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Đang xuất vé…' : 'Thu tiền mặt & xuất vé'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => setPicked(null)}>
                Chọn lại ghế
              </button>
            </div>
          </Form>
        </section>
      )}
    </div>
  );
}

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function CheckIn() {
  const [date, setDate] = useState(vnToday());
  const { trips } = useManageTrips(date);
  const [tripId, setTripId] = useState<number | null>(null);
  const [m, setM] = useState<Manifest | null>(null);
  const [code, setCode] = useState('');
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const loadManifest = (id: number) => api<Manifest>(`/staff/trips/${id}/passengers`).then(setM).catch((e) => message.error(errMsg(e, 'Không tải được danh sách')));
  useEffect(() => {
    if (tripId) loadManifest(tripId);
    else setM(null);
  }, [tripId]);
  useEffect(() => () => stopScan(), []);

  const checkin = async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    try {
      const r = await api<{ alreadyCheckedIn: boolean; ticket: Booking }>('/staff/checkin', { method: 'POST', body: { code: c } });
      const t = r.ticket;
      const wrongTrip = tripId != null && t.trip.id !== tripId;
      setLast({
        ok: !r.alreadyCheckedIn && !wrongTrip,
        text: `${t.code} · ghế ${t.seats.map((s) => s.code).join(', ')} · ${t.contactName}${r.alreadyCheckedIn ? ' – VÉ NÀY ĐÃ SOÁT TRƯỚC ĐÓ' : ''}${wrongTrip ? ` – LƯU Ý: vé thuộc chuyến ${fmtDateTime(t.trip.departAt)} ${t.trip.originCity} → ${t.trip.destinationCity}` : ''}`,
      });
      setCode('');
      if (tripId) loadManifest(tripId);
    } catch (e) {
      setLast({ ok: false, text: errMsg(e, 'Không soát được vé') });
    }
  };

  const stopScan = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const det = new Ctor({ formats: ['qr_code'] });
      requestAnimationFrame(async function loop() {
        const v = videoRef.current;
        if (!streamRef.current || !v) return;
        if (v.srcObject !== stream) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
        try {
          const found = await det.detect(v);
          if (found[0]?.rawValue) {
            stopScan();
            await checkin(found[0].rawValue);
            return;
          }
        } catch {
          /* khung hình chưa sẵn sàng */
        }
        setTimeout(() => requestAnimationFrame(loop), 250);
      });
    } catch {
      message.error('Không mở được camera. Hãy nhập mã vé bằng tay.');
      stopScan();
    }
  };

  return (
    <div>
      <div className="toolbar">
        <DatePicker id="check-date" value={dayjs(date)} allowClear={false} onChange={(d) => d && (setDate(d.format('YYYY-MM-DD')), setTripId(null))} format="DD/MM/YYYY" />
        <Select id="check-trip" style={{ minWidth: 360, flex: 1 }} placeholder="Chọn chuyến để xem danh sách" loading={!trips} value={tripId ?? undefined} onChange={setTripId} allowClear options={(trips ?? []).map((t) => ({ value: t.id, label: tripLabel(t) }))} />
      </div>
      <section className="card checkin-box">
        <h3>Soát vé lên xe</h3>
        <div className="toolbar">
          <Input id="checkin-code" placeholder="Nhập mã vé hoặc quét QR (VD: VE7K3QZ9MP)" value={code} onChange={(e) => setCode(e.target.value)} onPressEnter={() => checkin(code)} style={{ maxWidth: 380 }} />
          <button className="btn-primary" onClick={() => checkin(code)}>
            <CheckCircleOutlined /> Xác nhận lên xe
          </button>
          {canScan && (
            <button className="btn-outline" onClick={scanning ? stopScan : startScan}>
              <CameraOutlined /> {scanning ? 'Tắt camera' : 'Quét QR bằng camera'}
            </button>
          )}
        </div>
        {!canScan && <p className="hint">Trình duyệt này chưa hỗ trợ quét QR trực tiếp; nhập mã in dưới mã QR trên vé.</p>}
        {scanning && <video ref={videoRef} className="scan-video" muted playsInline />}
        {last && <Alert type={last.ok ? 'success' : 'warning'} showIcon message={last.text} style={{ marginTop: 12 }} />}
      </section>
      {m && (
        <section className="card">
          <div className="page-head">
            <h3>
              Danh sách hành khách · {fmtDateTime(m.trip.departAt)} · {m.trip.originCity} → {m.trip.destinationCity} · {m.trip.plateNumber}
            </h3>
            <div style={{ minWidth: 200 }}>
              <small className="muted">
                Đã lên xe {m.checkedIn}/{m.total}
              </small>
              <Progress percent={m.total ? Math.round((m.checkedIn / m.total) * 100) : 0} size="small" showInfo={false} />
            </div>
          </div>
          <Table
            size="small"
            rowKey="itemId"
            dataSource={m.passengers}
            pagination={false}
            scroll={{ x: true }}
            locale={{ emptyText: 'Chưa có hành khách đã thanh toán' }}
            columns={[
              { title: 'Ghế', dataIndex: 'seat', width: 70 },
              { title: 'Hành khách', dataIndex: 'name', render: (v, r) => `${v ?? '—'}${r.gender ? ` (${GENDER[r.gender]})` : ''}` },
              { title: 'SĐT', dataIndex: 'phone' },
              { title: 'Mã vé', dataIndex: 'code' },
              { title: 'Điểm đón', dataIndex: 'pickup' },
              { title: 'Kênh', dataIndex: 'channel', render: (v) => (v === 'COUNTER' ? 'Tại quầy' : 'Online') },
              {
                title: 'Lên xe',
                dataIndex: 'checkedInAt',
                render: (v, r) =>
                  v ? (
                    <Tag color="green">{fmtTime(v)}</Tag>
                  ) : (
                    <button className="btn-ghost" onClick={() => checkin(r.code)}>
                      Soát
                    </button>
                  ),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}
