import {
  AuditOutlined,
  BarChartOutlined,
  CarOutlined,
  CommentOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  DownloadOutlined,
  GiftOutlined,
  MailOutlined,
  NodeIndexOutlined,
  PieChartOutlined,
  ReadOutlined,
  ScheduleOutlined,
  TagsOutlined,
  TeamOutlined,
  WomanOutlined,
} from '@ant-design/icons';
import { Alert, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Result, Segmented, Select, Skeleton, Switch, Table, Tag, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api, download } from '../api';
import { useAuth } from '../auth';
import { addDays, fmtDateTime, fmtDay, fmtTime, money, vnToday } from '../format';
import { message } from '../notify';
import type { RouteInfo, SeatMap } from '../types';
import { AuditPanel, BookingsPanel, ChatsPanel, CouponsPanel, KbPanel, MailsPanel, SupportPanel, UsersPanel } from './AdminData';
import { useManageTrips } from './Staff';

export const errMsg = (e: unknown, d: string) => (e instanceof ApiError ? e.message : d);

const SECTIONS: { key: string; label: string; icon: ReactNode; el: () => ReactNode }[] = [
  { key: 'thong-ke', label: 'Thống kê', icon: <BarChartOutlined />, el: () => <StatsPanel /> },
  { key: 'chuyen', label: 'Chuyến & lịch chạy', icon: <ScheduleOutlined />, el: () => <TripsPanel /> },
  { key: 'tuyen', label: 'Tuyến & điểm đón', icon: <NodeIndexOutlined />, el: () => <RoutesPanel /> },
  { key: 'xe', label: 'Xe & sơ đồ ghế', icon: <CarOutlined />, el: () => <BusesPanel /> },
  { key: 've', label: 'Đơn / vé', icon: <TagsOutlined />, el: () => <BookingsPanel /> },
  { key: 'nguoi-dung', label: 'Người dùng', icon: <TeamOutlined />, el: () => <UsersPanel /> },
  { key: 'ma-giam-gia', label: 'Mã giảm giá', icon: <GiftOutlined />, el: () => <CouponsPanel /> },
  { key: 'tri-thuc', label: 'Tri thức chatbot', icon: <ReadOutlined />, el: () => <KbPanel /> },
  { key: 'chat', label: 'Lịch sử chat', icon: <CommentOutlined />, el: () => <ChatsPanel /> },
  { key: 'ho-tro', label: 'Hỗ trợ khách', icon: <CustomerServiceOutlined />, el: () => <SupportPanel /> },
  { key: 'nhat-ky', label: 'Nhật ký thao tác', icon: <AuditOutlined />, el: () => <AuditPanel /> },
  { key: 'hop-thu', label: 'Hộp thư thử nghiệm', icon: <MailOutlined />, el: () => <MailsPanel /> },
];

/** F25–F32, F34, F35: trang quản trị */
export function Admin() {
  const { user, ready, requireLogin } = useAuth();
  const [params, setParams] = useSearchParams();
  const cur = SECTIONS.find((s) => s.key === params.get('muc')) ?? SECTIONS[0];
  useEffect(() => {
    if (!user && ready) requireLogin();
  }, [user, ready]);
  if (!user) return <Result status="403" title="Cần đăng nhập quản trị viên" subTitle="Tài khoản mẫu: admin@example.com / Matkhau@123" />;
  if (user.role !== 'ADMIN') return <Result status="403" title="Chỉ quản trị viên được vào trang này" />;
  return (
    <div className="admin">
      <aside className="admin-side" aria-label="Mục quản trị">
        <span className="as-title">Hệ thống quản trị</span>
        {SECTIONS.map((s) => (
          <button key={s.key} className={s.key === cur.key ? 'on' : ''} onClick={() => setParams({ muc: s.key })}>
            {s.icon} <span>{s.label}</span>
          </button>
        ))}
      </aside>
      <section className="admin-main">
        <h1>{cur.label}</h1>
        {cur.el()}
      </section>
    </div>
  );
}

// ======================= Thống kê (F30) =======================

interface Stats {
  from: string;
  to: string;
  revenue: number;
  discount: number;
  bookings: number;
  tickets: number;
  trips: number;
  occupancy: number;
  byDay: { day: string; revenue: number; bookings: number }[];
  byRoute: { route: string; revenue: number; tickets: number }[];
  tripRows: { id: number; departAt: string; route: string; busType: string; status: string; sold: number; total: number; occupancy: number }[];
}

const shortMoney = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} tỷ` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} tr` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

function StatsPanel() {
  const [range, setRange] = useState<[string, string]>([addDays(vnToday(), -7), addDays(vnToday(), 7)]);
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  useEffect(() => {
    setS(null);
    setErr(null);
    api<Stats>(`/admin/stats?from=${range[0]}&to=${range[1]}`).then(setS).catch((e) => setErr(errMsg(e, 'Không tải được thống kê')));
  }, [range]);

  // Đủ mọi ngày trong khoảng, ngày không có doanh thu = 0
  const days = useMemo(() => {
    if (!s) return [];
    const map = new Map(s.byDay.map((d) => [d.day, d]));
    const out: { day: string; revenue: number; bookings: number }[] = [];
    for (let d = s.from; d <= s.to; d = addDays(d, 1)) out.push(map.get(d) ?? { day: d, revenue: 0, bookings: 0 });
    return out;
  }, [s]);

  return (
    <div>
      <div className="toolbar">
        <DatePicker.RangePicker
          id="stats-range"
          allowClear={false}
          format="DD/MM/YYYY"
          value={[dayjs(range[0]), dayjs(range[1])]}
          onChange={(v) => v?.[0] && v[1] && setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')])}
        />
        <Segmented value={view} onChange={(v) => setView(v as typeof view)} options={[{ value: 'chart', label: 'Biểu đồ' }, { value: 'table', label: 'Bảng số liệu' }]} />
        <button className="btn-outline" onClick={() => download(`/admin/stats/export?from=${range[0]}&to=${range[1]}`, `thong-ke-${range[0]}_${range[1]}.xlsx`).catch((e) => message.error(errMsg(e, 'Không xuất được')))}>
          <DownloadOutlined /> Xuất Excel
        </button>
      </div>
      <p className="hint">Tính theo ngày khởi hành của chuyến, chỉ đơn đã thanh toán. Dữ liệu là dữ liệu mẫu.</p>
      {err && <Alert type="error" showIcon message={err} />}
      {!s && !err && <Skeleton active />}
      {s && (
        <>
          <div className="kpis">
            <Kpi icon={<DollarOutlined />} tone="green" label="Doanh thu" value={money(s.revenue)} note={s.discount ? `đã trừ giảm giá ${money(s.discount)}` : undefined} />
 <Kpi icon={<TagsOutlined />} tone="blue" label="Vé đã bán" value={s.tickets.toLocaleString('vi-VN')} note={`${s.bookings} đơn`} />
 <Kpi icon={<CarOutlined />} tone="amber" label="Số chuyến" value={s.trips.toLocaleString('vi-VN')} />
 <Kpi icon={<PieChartOutlined />} tone="rose" label="Lấp đầy trung bình" value={`${s.occupancy.toLocaleString('vi-VN')}%`} />
          </div>
          {view === 'chart' ? (
            <>
              <section className="card">
                <h3 className="chart-title">Doanh thu theo ngày</h3>
                <BarChart rows={days.map((d) => ({ key: d.day, label: d.day.slice(8) + '/' + d.day.slice(5, 7), value: d.revenue, tip: `${d.day.split('-').reverse().join('/')}: ${money(d.revenue)} · ${d.bookings} đơn` }))} />
              </section>
              <div className="two-col">
                <section className="card">
                  <h3 className="chart-title">Doanh thu theo tuyến</h3>
                  {!s.byRoute.length && <Empty description="Chưa có doanh thu" />}
                  <div className="hbars">
                    {s.byRoute.map((r) => (
                      <div key={r.route} className="hbar" title={`${r.route}: ${money(r.revenue)} · ${r.tickets} vé`}>
                        <span className="hbar-label">{r.route}</span>
                        <span className="hbar-track">
                          <span className="hbar-fill" style={{ width: `${(r.revenue / Math.max(...s.byRoute.map((x) => x.revenue))) * 100}%` }} />
                        </span>
                        <span className="hbar-value">{shortMoney(r.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <h3 className="chart-title">Lấp đầy theo chuyến (cao nhất)</h3>
                  <div className="hbars">
                    {[...s.tripRows]
                      .sort((a, b) => b.occupancy - a.occupancy)
                      .slice(0, 8)
                      .map((t) => (
                        <div key={t.id} className="hbar" title={`${t.route} ${fmtDateTime(t.departAt)}: ${t.sold}/${t.total} ghế`}>
                          <span className="hbar-label">
                            {fmtDay(t.departAt).slice(0, 5)} {fmtTime(t.departAt)} · {t.route.replace('TP. Hồ Chí Minh', 'HCM')}
                          </span>
                          <span className="hbar-track meter">
                            <span className="hbar-fill" style={{ width: `${t.occupancy}%` }} />
                          </span>
                          <span className="hbar-value">{t.occupancy}%</span>
                        </div>
                      ))}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              <section className="card">
                <h3 className="chart-title">Doanh thu theo ngày</h3>
                <Table size="small" rowKey="day" pagination={false} dataSource={days} columns={[{ title: 'Ngày', dataIndex: 'day' }, { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: money }, { title: 'Số đơn', dataIndex: 'bookings', align: 'right' }]} />
              </section>
              <section className="card">
                <h3 className="chart-title">Theo tuyến</h3>
                <Table size="small" rowKey="route" pagination={false} dataSource={s.byRoute} columns={[{ title: 'Tuyến', dataIndex: 'route' }, { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: money }, { title: 'Số vé', dataIndex: 'tickets', align: 'right' }]} />
              </section>
              <section className="card">
                <h3 className="chart-title">Lấp đầy theo chuyến</h3>
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={s.tripRows}
                  scroll={{ x: true }}
                  columns={[
                    { title: 'Khởi hành', dataIndex: 'departAt', render: fmtDateTime },
                    { title: 'Tuyến', dataIndex: 'route' },
                    { title: 'Loại xe', dataIndex: 'busType' },
                    { title: 'Đã bán', render: (_, t) => `${t.sold}/${t.total}`, align: 'right' },
                    { title: 'Lấp đầy', dataIndex: 'occupancy', align: 'right', render: (v) => `${v}%`, sorter: (a, b) => a.occupancy - b.occupancy },
                  ]}
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, note, icon, tone }: { label: string; value: string; note?: string; icon?: ReactNode; tone?: string }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      {icon && <i className="kpi-icon">{icon}</i>}
      <span>{label}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

/** Cột dọc một màu, có trục số và chú thích khi rê chuột */
function BarChart({ rows }: { rows: { key: string; label: string; value: number; tip: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const W = 720;
  const H = 220;
  const padL = 48;
  const padB = 24;
  const bw = (W - padL) / Math.max(rows.length, 1);
  const barW = Math.max(4, Math.min(28, bw - 2));
  const padT = 12;
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / top);
  const showEvery = Math.ceil(rows.length / 12);
  return (
    <div className="bar-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ doanh thu theo ngày">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {shortMoney(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = padL + i * bw + (bw - barW) / 2;
          const h = (H - padB) - y(r.value);
          return (
            <g key={r.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={0} width={bw} height={H - padB} fill="transparent" />
              {r.value > 0 && <path d={roundTop(x, y(r.value), barW, h, Math.min(4, barW / 2, h))} className={`bar ${hover === i ? 'on' : ''}`} />}
              {i % showEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="axis">
                  {r.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%` }}>
          {rows[hover].tip}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Cột bo tròn 4px ở đầu, đáy vuông nằm trên trục */
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// ======================= Chuyến & lịch chạy (F27) =======================

interface Bus {
  id: number;
  plateNumber: string;
  busType: string;
  seatLayoutId: number;
  amenities: string[];
  layout: { id: number; name: string; floors: number; rows: number; cols: number };
}
interface Schedule {
  id: number;
  routeId: number;
  busId: number;
  departTime: string;
  durationMinutes: number;
  basePrice: number;
  isActive: boolean;
  route: { originCity: string; destinationCity: string };
  bus: { busType: string; plateNumber: string };
}

const TRIP_STATUS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: 'Đang bán', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
  DEPARTED: { label: 'Đã chạy', color: 'blue' },
  COMPLETED: { label: 'Hoàn thành', color: 'blue' },
};

function TripsPanel() {
  const [date, setDate] = useState(vnToday());
  const { trips, reload } = useManageTrips(date);
  const [seatTrip, setSeatTrip] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [days, setDays] = useState(14);
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm();

  const loadSchedules = () => api<Schedule[]>('/schedules').then(setSchedules).catch(() => undefined);
  useEffect(() => {
    loadSchedules();
    api<RouteInfo[]>('/routes').then(setRoutes).catch(() => undefined);
    api<Bus[]>('/buses').then(setBuses).catch(() => undefined);
  }, []);

  const cancelTrip = async (id: number) => {
    try {
      const r = await api<{ cancelledBookings: number; emailed: number }>(`/trips/${id}/cancel`, { method: 'POST' });
      message.success(`Đã hủy chuyến. Hoàn 100% cho ${r.cancelledBookings} đơn, đã gửi ${r.emailed} email báo khách.`);
      reload();
    } catch (e) {
      message.error(errMsg(e, 'Không hủy được chuyến'));
    }
  };

  const generate = async () => {
    try {
      const r = await api<{ created: number; skipped: number; schedules: number }>('/schedules/generate', { method: 'POST', body: { days } });
      message.success(`Tạo ${r.created} chuyến mới từ ${r.schedules} lịch chạy (bỏ qua ${r.skipped} chuyến đã có).`);
      reload();
    } catch (e) {
      message.error(errMsg(e, 'Không tạo được chuyến'));
    }
  };

  const toggleSchedule = async (s: Schedule, isActive: boolean) => {
    try {
      await api(`/schedules/${s.id}`, { method: 'PATCH', body: { isActive } });
      loadSchedules();
    } catch (e) {
      message.error(errMsg(e, 'Không cập nhật được'));
    }
  };

  const addSchedule = async (v: { routeId: number; busId: number; time: Dayjs; durationMinutes: number; basePrice: number }) => {
    try {
      await api('/schedules', { method: 'POST', body: { routeId: v.routeId, busId: v.busId, departTime: v.time.format('HH:mm'), durationMinutes: v.durationMinutes, basePrice: v.basePrice } });
      setAdding(false);
      form.resetFields();
      loadSchedules();
      message.success('Đã thêm lịch chạy. Bấm "Tạo chuyến" để sinh chuyến cho các ngày tới.');
    } catch (e) {
      message.error(errMsg(e, 'Không thêm được lịch'));
    }
  };

  return (
    <div>
      <section className="card">
        <div className="page-head">
          <h3>Chuyến trong ngày</h3>
          <DatePicker id="trips-date" value={dayjs(date)} allowClear={false} format="DD/MM/YYYY" onChange={(d) => d && setDate(d.format('YYYY-MM-DD'))} />
        </div>
        <Table
          size="small"
          rowKey="id"
          loading={!trips}
          dataSource={trips ?? []}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            { title: 'Giờ', dataIndex: 'departAt', render: fmtTime, width: 70 },
            { title: 'Tuyến', render: (_, t) => `${t.route.originCity} → ${t.route.destinationCity}` },
            { title: 'Xe', render: (_, t) => `${t.bus.busType} · ${t.bus.plateNumber}` },
            { title: 'Giá', dataIndex: 'basePrice', render: money, align: 'right' },
            { title: 'Đã bán', render: (_, t) => `${t.soldSeats}/${t._count.tripSeats}${t.blockedSeats ? ` (khóa ${t.blockedSeats})` : ''}`, align: 'right' },
            { title: 'Trạng thái', dataIndex: 'status', render: (v) => <Tag color={TRIP_STATUS[v]?.color}>{TRIP_STATUS[v]?.label ?? v}</Tag> },
            {
              title: '',
              render: (_, t) =>
                t.status === 'SCHEDULED' && (
                  <span className="row-actions">
                    <button className="btn-ghost" onClick={() => setSeatTrip(t.id)}>
                      Khóa ghế
                    </button>
                    <Popconfirm title="Hủy chuyến này?" description="Mọi vé đã bán được hoàn 100% và khách nhận email thông báo." okText="Hủy chuyến" cancelText="Không" onConfirm={() => cancelTrip(t.id)}>
                      <button className="btn-ghost danger">Hủy chuyến</button>
                    </Popconfirm>
                  </span>
                ),
            },
          ]}
        />
      </section>
      <section className="card">
        <div className="page-head">
          <h3>Lịch chạy cố định</h3>
          <div className="toolbar" style={{ margin: 0 }}>
            <span>Tạo chuyến cho</span>
            <InputNumber id="gen-days" min={1} max={60} value={days} onChange={(v) => setDays(v ?? 14)} style={{ width: 70 }} />
            <span>ngày tới</span>
            <button className="btn-primary" onClick={generate}>
              Tạo chuyến
            </button>
            <button className="btn-outline" onClick={() => setAdding(true)}>
              Thêm lịch
            </button>
          </div>
        </div>
        <Table
          size="small"
          rowKey="id"
          dataSource={schedules}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            { title: 'Giờ chạy', dataIndex: 'departTime', width: 90 },
            { title: 'Tuyến', render: (_, s) => `${s.route.originCity} → ${s.route.destinationCity}` },
            { title: 'Xe', render: (_, s) => `${s.bus.busType} · ${s.bus.plateNumber}` },
            { title: 'Thời gian', dataIndex: 'durationMinutes', render: (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` },
            { title: 'Giá', dataIndex: 'basePrice', render: money, align: 'right' },
            { title: 'Đang chạy', dataIndex: 'isActive', render: (v, s) => <Switch size="small" checked={v} onChange={(c) => toggleSchedule(s, c)} aria-label={`Bật tắt lịch ${s.departTime}`} /> },
          ]}
        />
      </section>
      <Modal open={adding} title="Thêm lịch chạy" onCancel={() => setAdding(false)} onOk={() => form.submit()} okText="Thêm" cancelText="Hủy" forceRender>
        <Form form={form} layout="vertical" onFinish={addSchedule} requiredMark={false} initialValues={{ durationMinutes: 420, basePrice: 300000 }}>
          <Form.Item name="routeId" label="Tuyến" rules={[{ required: true, message: 'Chọn tuyến' }]}>
            <Select id="sch-route" options={routes.map((r) => ({ value: r.id, label: `${r.originCity} → ${r.destinationCity}` }))} />
          </Form.Item>
          <Form.Item name="busId" label="Xe" rules={[{ required: true, message: 'Chọn xe' }]}>
            <Select id="sch-bus" options={buses.map((b) => ({ value: b.id, label: `${b.busType} · ${b.plateNumber}` }))} />
          </Form.Item>
          <div className="two-col">
            <Form.Item name="time" label="Giờ khởi hành" rules={[{ required: true, message: 'Chọn giờ' }]}>
              <TimePicker id="sch-time" format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="durationMinutes" label="Thời gian đi (phút)" rules={[{ required: true }]}>
              <InputNumber id="sch-dur" min={10} max={2880} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="basePrice" label="Giá vé cơ bản (đ)" rules={[{ required: true }]}>
            <InputNumber id="sch-price" min={0} step={10000} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={seatTrip != null} title="Khóa / mở ghế không bán" footer={null} onCancel={() => { setSeatTrip(null); reload(); }} width={560} destroyOnHidden>
        {seatTrip != null && <BlockSeats tripId={seatTrip} />}
      </Modal>
    </div>
  );
}

function BlockSeats({ tripId }: { tripId: number }) {
  const [map, setMap] = useState<SeatMap | null>(null);
  const load = () => api<SeatMap>(`/trips/${tripId}/seats`).then(setMap).catch((e) => message.error(errMsg(e, 'Không tải được sơ đồ')));
  useEffect(() => {
    load();
  }, [tripId]);
  if (!map) return <Skeleton active />;
  const toggle = async (seatId: number, blocked: boolean) => {
    try {
      await api(`/trips/${tripId}/seats/${seatId}/block`, { method: 'POST', body: { blocked } });
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không đổi được ghế'));
    }
  };
  return (
    <div>
      <p className="hint">Bấm ghế trống để khóa (ví dụ ghế hỏng, giữ cho tài xế phụ). Bấm lại để mở. Ghế đã bán không khóa được.</p>
      <div className="decks">
        {Array.from({ length: map.layout.floors }, (_, f) => (
          <div className="deck" key={f}>
            <div className="deck-title">{map.layout.floors > 1 ? `Tầng ${f === 0 ? 'dưới' : 'trên'}` : 'Sơ đồ ghế'}</div>
            <div className="deck-grid" style={{ gridTemplateColumns: `repeat(${map.layout.cols}, 44px)` }}>
              {map.seats
                .filter((s) => s.floor === f + 1)
                .map((s) => (
                  <button
                    key={s.seatId}
                    className={`seat ${s.status === 'BLOCKED' ? 'BLOCKED' : s.status === 'SOLD' ? 'SOLD' : ''}`}
                    style={{ gridRow: s.rowNo, gridColumn: s.colNo }}
                    disabled={s.status === 'SOLD' || s.status === 'HELD'}
                    title={`${s.code} · ${s.status === 'BLOCKED' ? 'đang khóa' : s.status === 'SOLD' ? 'đã bán' : 'trống'}`}
                    onClick={() => toggle(s.seatId, s.status !== 'BLOCKED')}
                  >
                    {s.code}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================= Tuyến (F25) =======================

function RoutesPanel() {
  const [routes, setRoutes] = useState<RouteInfo[] | null>(null);
  /** 'new' = thêm tuyến, RouteInfo = sửa tuyến đó */
  const [editing, setEditing] = useState<RouteInfo | 'new' | null>(null);
  const [form] = Form.useForm();
  const load = () => api<RouteInfo[]>('/routes?all=1').then(setRoutes).catch(() => setRoutes([]));
  useEffect(() => {
    load();
  }, []);

  const toggle = async (r: RouteInfo, isActive: boolean) => {
    try {
      await api(`/routes/${r.id}`, { method: 'PATCH', body: { isActive } });
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không cập nhật được'));
    }
  };

  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    if (editing !== 'new') {
      form.setFieldsValue({
        originCity: editing.originCity,
        destinationCity: editing.destinationCity,
        distanceKm: editing.distanceKm ?? undefined,
        durationMinutes: editing.durationMinutes ?? undefined,
        stops: editing.stops.map((st) => ({ type: st.type, name: st.name, address: st.address, offsetMinutes: st.offsetMinutes, lat: st.lat ?? undefined, lng: st.lng ?? undefined })),
      });
    }
  }, [editing]);

  const save = async (v: { originCity: string; destinationCity: string; distanceKm?: number; durationMinutes?: number; stops: { name: string; address: string; type: string; offsetMinutes?: number | null; lat?: number | null; lng?: number | null }[] }) => {
    // Bỏ ô trống, đánh lại số thứ tự theo thứ tự trên form
    const stops = v.stops.map((st, i) => ({
      name: st.name,
      address: st.address,
      type: st.type,
      orderNo: i + 1,
      offsetMinutes: st.offsetMinutes ?? 0,
      ...(st.lat != null && st.lng != null ? { lat: st.lat, lng: st.lng } : {}),
    }));
    const body = { originCity: v.originCity, destinationCity: v.destinationCity, distanceKm: v.distanceKm ?? undefined, durationMinutes: v.durationMinutes ?? undefined, stops };
    try {
      if (editing && editing !== 'new') await api(`/routes/${editing.id}`, { method: 'PATCH', body });
      else await api('/routes', { method: 'POST', body });
      message.success(editing === 'new' ? 'Đã thêm tuyến' : 'Đã lưu tuyến');
      setEditing(null);
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không lưu được tuyến (điểm đón đã có vé đặt thì không xóa được)'));
    }
  };

  return (
    <div>
      <div className="toolbar">
        <button className="btn-primary" onClick={() => setEditing('new')}>
          Thêm tuyến
        </button>
      </div>
      {!routes && <Skeleton active />}
      {routes?.map((r) => (
        <section key={r.id} className="card">
          <div className="page-head">
            <h3>
              {r.originCity} → {r.destinationCity}{' '}
              <small className="muted">
                {r.distanceKm ? `${r.distanceKm} km · ` : ''}
                {r.durationMinutes ? `${Math.floor(r.durationMinutes / 60)} giờ${r.durationMinutes % 60 ? ` ${r.durationMinutes % 60} phút` : ''}` : ''}
              </small>
            </h3>
            <span className="row-actions">
              <button className="btn-ghost" onClick={() => setEditing(r)}>
                Sửa tuyến
              </button>
              <label className="switch-label">
                <Switch size="small" checked={r.isActive} onChange={(c) => toggle(r, c)} aria-label={`Mở bán tuyến ${r.originCity} → ${r.destinationCity}`} /> Đang mở bán
              </label>
            </span>
          </div>
          <ol className="stop-admin">
            {r.stops.map((s) => (
              <li key={s.id}>
                <Tag color={s.type === 'PICKUP' ? 'green' : s.type === 'DROPOFF' ? 'blue' : 'purple'}>{s.type === 'PICKUP' ? 'Đón' : s.type === 'DROPOFF' ? 'Trả' : 'Đón/Trả'}</Tag>
                <b>{s.name}</b> <span className="muted">{s.address} · +{s.offsetMinutes} phút{s.lat != null ? ` · ${s.lat}, ${s.lng}` : ''}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <Modal
        open={!!editing}
        title={editing === 'new' ? 'Thêm tuyến' : editing ? `Sửa tuyến ${editing.originCity} → ${editing.destinationCity}` : ''}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText={editing === 'new' ? 'Thêm' : 'Lưu'}
        cancelText="Hủy"
        width={1000}
        forceRender
      >
        {editing && editing !== 'new' && <p className="hint">Điểm đón được nhận theo thứ tự. Sửa giờ/địa chỉ áp dụng ngay cho các chuyến của tuyến; xóa điểm đã có khách đặt sẽ bị chặn.</p>}
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          requiredMark={false}
          initialValues={{ stops: [{ type: 'PICKUP', offsetMinutes: 0 }, { type: 'DROPOFF' }] }}
        >
          <div className="two-col">
            <Form.Item name="originCity" label="Điểm đi" rules={[{ required: true, min: 2 }]}>
              <Input id="r-origin" />
            </Form.Item>
            <Form.Item name="destinationCity" label="Điểm đến" rules={[{ required: true, min: 2 }]}>
              <Input id="r-dest" />
            </Form.Item>
            <Form.Item name="distanceKm" label="Quãng đường (km)">
              <InputNumber id="r-km" min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="durationMinutes" label="Thời gian (phút)">
              <InputNumber id="r-min" min={1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <h4>Điểm đón / trả (theo thứ tự xe chạy)</h4>
          <Form.List name="stops">
            {(fields, { add: addStop, remove }) => (
              <>
                <div className="stop-row stop-head" aria-hidden="true">
                  <span>Loại</span>
                  <span>Tên điểm</span>
                  <span>Địa chỉ</span>
                  <span>Sau giờ chạy (phút)</span>
                  <span>Vĩ độ</span>
                  <span>Kinh độ</span>
                  <span />
                </div>
                {fields.map((f) => (
                  <div key={f.key} className="stop-row">
                    <Form.Item name={[f.name, 'type']} rules={[{ required: true }]}>
                      <Select options={[{ value: 'PICKUP', label: 'Đón' }, { value: 'DROPOFF', label: 'Trả' }, { value: 'BOTH', label: 'Đón/Trả' }]} aria-label="Loại điểm" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'name']} rules={[{ required: true, min: 2, message: 'Tên' }]}>
                      <Input placeholder="Tên điểm" aria-label="Tên điểm" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'address']} rules={[{ required: true, min: 2, message: 'Địa chỉ' }]}>
                      <Input placeholder="Địa chỉ" aria-label="Địa chỉ" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'offsetMinutes']}>
                      <InputNumber placeholder="0" min={0} aria-label="Số phút sau giờ khởi hành" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'lat']}>
                      <InputNumber placeholder="Vĩ độ" aria-label="Vĩ độ" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'lng']}>
                      <InputNumber placeholder="Kinh độ" aria-label="Kinh độ" />
                    </Form.Item>
                    <button type="button" className="btn-ghost" onClick={() => remove(f.name)} aria-label="Xóa điểm" disabled={fields.length <= 2}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-outline" onClick={() => addStop({ type: 'PICKUP' })}>
                  Thêm điểm
                </button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}

// ======================= Xe & sơ đồ ghế (F26, F10) =======================

interface LayoutSeat {
  id: number;
  code: string;
  floor: number;
  rowNo: number;
  colNo: number;
  priceExtra: number;
  femaleOnly: boolean;
}
interface Layout {
  id: number;
  name: string;
  floors: number;
  rows: number;
  cols: number;
  seats: LayoutSeat[];
}

const AMENITIES = ['Wi-Fi', 'Nước uống', 'Khăn lạnh', 'Chăn đắp', 'Ổ sạc USB', 'TV', 'Nhà vệ sinh', 'Rèm riêng', 'Ghế massage'];

function BusesPanel() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [layoutId, setLayoutId] = useState<number | null>(null);
  const [seat, setSeat] = useState<LayoutSeat | null>(null);
  const [extra, setExtra] = useState(0);
  const [female, setFemale] = useState(false);
  const [busEdit, setBusEdit] = useState<Bus | 'new' | null>(null);
  const [newLayout, setNewLayout] = useState(false);
  const [busForm] = Form.useForm();
  const [layoutForm] = Form.useForm();
  const lf = Form.useWatch([], layoutForm) as { floors?: number; rows?: number; cols?: number } | undefined;

  useEffect(() => {
    if (!busEdit) return;
    busForm.resetFields();
    if (busEdit !== 'new') busForm.setFieldsValue({ plateNumber: busEdit.plateNumber, busType: busEdit.busType, seatLayoutId: busEdit.seatLayoutId, amenities: busEdit.amenities });
  }, [busEdit]);

  const saveBus = async (v: { plateNumber: string; busType: string; seatLayoutId: number; amenities?: string[] }) => {
    const body = { plateNumber: v.plateNumber.trim().toUpperCase(), busType: v.busType.trim(), seatLayoutId: v.seatLayoutId, amenities: v.amenities ?? [] };
    try {
      if (busEdit && busEdit !== 'new') await api(`/buses/${busEdit.id}`, { method: 'PATCH', body });
      else await api('/buses', { method: 'POST', body });
      message.success(busEdit === 'new' ? 'Đã thêm xe. Tạo lịch chạy cho xe ở mục Chuyến & lịch chạy.' : 'Đã lưu xe');
      setBusEdit(null);
      load();
    } catch (e) {
      message.error(e instanceof ApiError && e.status === 409 ? `Biển số ${body.plateNumber} đã có trong đội xe` : errMsg(e, 'Không lưu được xe'));
    }
  };

  const saveLayout = async (v: { name: string; floors: number; rows: number; cols: number }) => {
    try {
      const l = await api<Layout>('/seat-layouts', { method: 'POST', body: v });
      message.success(`Đã tạo sơ đồ "${l.name}" với ${l.seats.length} ghế`);
      setNewLayout(false);
      layoutForm.resetFields();
      setLayoutId(l.id);
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không tạo được sơ đồ'));
    }
  };

  const load = () => {
    api<Bus[]>('/buses').then(setBuses).catch(() => undefined);
    api<Layout[]>('/seat-layouts')
      .then((l) => {
        setLayouts(l);
        setLayoutId((cur) => cur ?? l[0]?.id ?? null);
      })
      .catch(() => undefined);
  };
  useEffect(load, []);

  const saveAmen = async (b: Bus, amenities: string[]) => {
    try {
      await api(`/buses/${b.id}`, { method: 'PATCH', body: { amenities } });
      load();
    } catch (e) {
      message.error(errMsg(e, 'Không lưu được'));
    }
  };

  const saveSeat = async () => {
    if (!seat) return;
    try {
      await api(`/seats/${seat.id}`, { method: 'PATCH', body: { priceExtra: extra, femaleOnly: female } });
      setSeat(null);
      load();
      message.success(`Đã lưu ghế ${seat.code}. Áp dụng cho chuyến mới và giá hiển thị.`);
    } catch (e) {
      message.error(errMsg(e, 'Không lưu được ghế'));
    }
  };

  const layout = layouts.find((l) => l.id === layoutId);

  return (
    <div>
      <section className="card">
        <div className="page-head">
          <h3>Đội xe</h3>
          <button className="btn-primary" onClick={() => setBusEdit('new')}>
            Thêm xe
          </button>
        </div>
        <Table
          size="small"
          rowKey="id"
          dataSource={buses}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            { title: 'Biển số', dataIndex: 'plateNumber' },
            { title: 'Loại xe', dataIndex: 'busType' },
            { title: 'Sơ đồ ghế', render: (_, b) => b.layout.name },
            {
              title: 'Tiện ích',
              dataIndex: 'amenities',
              render: (v: string[], b) => <Select mode="multiple" size="small" style={{ minWidth: 280 }} value={v} onChange={(x) => saveAmen(b, x)} options={AMENITIES.map((a) => ({ value: a, label: a }))} aria-label={`Tiện ích xe ${b.plateNumber}`} />,
            },
            {
              title: '',
              render: (_, b) => (
                <button className="btn-ghost" onClick={() => setBusEdit(b)}>
                  Sửa
                </button>
              ),
            },
          ]}
        />
      </section>
      <section className="card">
        <div className="page-head">
          <h3>Sơ đồ ghế</h3>
          <span className="row-actions">
            <Select id="layout-pick" value={layoutId ?? undefined} onChange={setLayoutId} options={layouts.map((l) => ({ value: l.id, label: `${l.name} (${l.seats.length} ghế)` }))} style={{ minWidth: 260 }} />
            <button className="btn-outline" onClick={() => setNewLayout(true)}>
              Tạo sơ đồ mới
            </button>
          </span>
        </div>
        <p className="hint">
          Bấm vào ghế để đặt phụ thu (ví dụ ghế tầng dưới, hàng đầu) hoặc đánh dấu ghế chỉ dành cho nữ. <WomanOutlined /> = ghế nữ, số nhỏ = phụ thu.
        </p>
        {layout && (
          <div className="decks">
            {Array.from({ length: layout.floors }, (_, f) => (
              <div className="deck" key={f}>
                <div className="deck-title">{layout.floors > 1 ? `Tầng ${f === 0 ? 'dưới' : 'trên'}` : 'Sơ đồ'}</div>
                <div className="deck-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 52px)` }}>
                  {layout.seats
                    .filter((s) => s.floor === f + 1)
                    .map((s) => (
                      <button
                        key={s.id}
                        className={`seat layout-seat ${s.femaleOnly ? 'female' : ''}`}
                        style={{ gridRow: s.rowNo, gridColumn: s.colNo }}
                        onClick={() => {
                          setSeat(s);
                          setExtra(s.priceExtra);
                          setFemale(s.femaleOnly);
                        }}
                      >
                        {s.femaleOnly && <WomanOutlined />} {s.code}
                        {s.priceExtra > 0 && <small>+{shortMoney(s.priceExtra)}</small>}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <Modal open={!!busEdit} title={busEdit === 'new' ? 'Thêm xe' : `Sửa xe ${busEdit ? busEdit.plateNumber : ''}`} onCancel={() => setBusEdit(null)} onOk={() => busForm.submit()} okText={busEdit === 'new' ? 'Thêm' : 'Lưu'} cancelText="Hủy" forceRender>
        <Form form={busForm} layout="vertical" onFinish={saveBus} requiredMark={false}>
          <div className="two-col">
            <Form.Item name="plateNumber" label="Biển số" rules={[{ required: true, min: 4, max: 20, message: 'Biển số 4–20 ký tự' }]}>
              <Input id="bus-plate" placeholder="51B-123.45" />
            </Form.Item>
            <Form.Item name="busType" label="Loại xe (hiện cho khách)" rules={[{ required: true, min: 2, message: 'Nhập loại xe' }]}>
              <Input id="bus-type" placeholder="Giường nằm 36 chỗ" />
            </Form.Item>
          </div>
          <Form.Item name="seatLayoutId" label="Sơ đồ ghế" rules={[{ required: true, message: 'Chọn sơ đồ ghế' }]} extra={busEdit && busEdit !== 'new' ? 'Đổi sơ đồ chỉ áp dụng cho chuyến tạo sau này, chuyến đã có giữ sơ đồ cũ.' : undefined}>
            <Select id="bus-layout" options={layouts.map((l) => ({ value: l.id, label: `${l.name} (${l.seats.length} ghế)` }))} />
          </Form.Item>
          <Form.Item name="amenities" label="Tiện ích">
            <Select id="bus-amen" mode="multiple" options={AMENITIES.map((a) => ({ value: a, label: a }))} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={newLayout} title="Tạo sơ đồ ghế mới" onCancel={() => setNewLayout(false)} onOk={() => layoutForm.submit()} okText="Tạo" cancelText="Hủy" forceRender>
        <Form form={layoutForm} layout="vertical" onFinish={saveLayout} requiredMark={false} initialValues={{ floors: 2, rows: 6, cols: 3 }}>
          <Form.Item name="name" label="Tên sơ đồ" rules={[{ required: true, min: 2, message: 'Nhập tên' }]}>
            <Input id="layout-name" placeholder="Giường nằm 2 tầng 36 chỗ" />
          </Form.Item>
          <div className="three-col">
            <Form.Item name="floors" label="Số tầng" rules={[{ required: true }]}>
              <InputNumber id="layout-floors" min={1} max={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="rows" label="Số hàng mỗi tầng" rules={[{ required: true }]}>
              <InputNumber id="layout-rows" min={1} max={20} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="cols" label="Số ghế mỗi hàng" rules={[{ required: true }]}>
              <InputNumber id="layout-cols" min={1} max={6} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <p className="hint">
            Sẽ tạo {(lf?.floors ?? 0) * (lf?.rows ?? 0) * (lf?.cols ?? 0)} ghế. Sau khi tạo, bấm từng ghế để đặt phụ thu hoặc ghế dành cho nữ, rồi gán sơ đồ cho xe.
          </p>
        </Form>
      </Modal>
      <Modal open={!!seat} title={`Ghế ${seat?.code}`} onCancel={() => setSeat(null)} onOk={saveSeat} okText="Lưu" cancelText="Hủy">
        <Form layout="vertical">
          <Form.Item label="Phụ thu so với giá cơ bản (đ)">
            <InputNumber id="seat-extra" min={0} max={2000000} step={10000} value={extra} onChange={(v) => setExtra(v ?? 0)} style={{ width: '100%' }} />
          </Form.Item>
          <label className="switch-label">
            <Switch checked={female} onChange={setFemale} /> Ghế chỉ dành cho nữ
          </label>
        </Form>
      </Modal>
    </div>
  );
}
