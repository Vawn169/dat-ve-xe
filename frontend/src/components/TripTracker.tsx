// Theo dõi chuyến xe trên bản đồ (Leaflet + OpenStreetMap).
// Bản đồ án chưa có thiết bị GPS trên xe nên vị trí xe là MÔ PHỎNG: tính theo giờ xuất bến, giờ đến
// và lộ trình (điểm dừng của tuyến + các thị trấn dọc quốc lộ). Có chế độ "chạy thử nhanh" để demo.
import { AimOutlined, ClockCircleOutlined, EnvironmentOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Modal, Progress, Segmented, Tag } from 'antd';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { fmtTime } from '../format';
import type { Booking, RouteInfo } from '../types';

type LatLng = [number, number];
interface Point {
  name: string;
  at: LatLng;
  kind: 'stop' | 'town';
  /** số phút so với giờ xuất bến, nếu tuyến có ghi */
  offset?: number;
}

/** Tọa độ trung tâm thành phố, dùng khi điểm dừng chưa có tọa độ. */
const CITY: Record<string, LatLng> = {
  'TP. Hồ Chí Minh': [10.7769, 106.7009],
  'Đà Lạt': [11.9404, 108.4583],
  'Nha Trang': [12.2388, 109.1967],
  'Vũng Tàu': [10.346, 107.0843],
  'Cần Thơ': [10.0452, 105.7469],
  'Hà Nội': [21.0285, 105.8542],
  'Sa Pa': [22.3364, 103.8438],
  'Hải Phòng': [20.8449, 106.6881],
};

/** Các thị trấn xe đi qua (theo chiều từ thành phố đầu sang thành phố sau). */
const VIA: Record<string, { name: string; at: LatLng }[]> = {
  'TP. Hồ Chí Minh|Đà Lạt': [
    { name: 'Biên Hòa', at: [10.9574, 106.8426] },
    { name: 'Dầu Giây', at: [10.9406, 107.1425] },
    { name: 'Định Quán', at: [11.1937, 107.3446] },
    { name: 'Bảo Lộc', at: [11.5482, 107.8077] },
    { name: 'Di Linh', at: [11.5795, 108.0727] },
    { name: 'Đức Trọng', at: [11.7366, 108.3734] },
  ],
  'TP. Hồ Chí Minh|Nha Trang': [
    { name: 'Biên Hòa', at: [10.9574, 106.8426] },
    { name: 'Dầu Giây', at: [10.9406, 107.1425] },
    { name: 'Phan Thiết', at: [10.9289, 108.1021] },
    { name: 'Phan Rang', at: [11.5643, 108.9886] },
    { name: 'Cam Ranh', at: [11.9214, 109.1591] },
  ],
  'TP. Hồ Chí Minh|Vũng Tàu': [
    { name: 'Long Thành', at: [10.7804, 106.9516] },
    { name: 'Bà Rịa', at: [10.4963, 107.1685] },
  ],
  'TP. Hồ Chí Minh|Cần Thơ': [
    { name: 'Tân An', at: [10.5359, 106.4137] },
    { name: 'Mỹ Thuận', at: [10.2766, 105.9093] },
  ],
  'Hà Nội|Sa Pa': [
    { name: 'Việt Trì', at: [21.3227, 105.4024] },
    { name: 'Yên Bái', at: [21.7229, 104.9113] },
    { name: 'Lào Cai', at: [22.4856, 103.9707] },
  ],
  'Hà Nội|Hải Phòng': [{ name: 'Hải Dương', at: [20.9373, 106.3146] }],
  'Hà Nội|TP. Hồ Chí Minh': [
    { name: 'Ninh Bình', at: [20.2506, 105.9745] },
    { name: 'Thanh Hóa', at: [19.8067, 105.7852] },
    { name: 'Vinh', at: [18.6796, 105.6813] },
    { name: 'Đồng Hới', at: [17.4833, 106.6] },
    { name: 'Huế', at: [16.4637, 107.5909] },
    { name: 'Đà Nẵng', at: [16.0544, 108.2022] },
    { name: 'Quảng Ngãi', at: [15.1214, 108.8044] },
    { name: 'Quy Nhơn', at: [13.782, 109.2197] },
    { name: 'Tuy Hòa', at: [13.0955, 109.3209] },
    { name: 'Nha Trang', at: [12.2388, 109.1967] },
    { name: 'Phan Thiết', at: [10.9289, 108.1021] },
    { name: 'Biên Hòa', at: [10.9574, 106.8426] },
  ],
};

function km(a: LatLng, b: LatLng) {
  const R = 6371;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b[0] - a[0]);
  const dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Lộ trình: điểm dừng của tuyến (có tọa độ) xen với thị trấn dọc đường, sắp theo khoảng cách từ điểm đầu. */
function buildPath(route: RouteInfo): Point[] {
  const from = route.originCity;
  const to = route.destinationCity;
  const startAt = CITY[from];
  const endAt = CITY[to];
  const stops: Point[] = [...route.stops]
    .sort((a, b) => a.orderNo - b.orderNo)
    .map((s, i, arr) => ({
      name: s.name,
      kind: 'stop' as const,
      offset: s.offsetMinutes,
      at: (s.lat != null && s.lng != null ? [s.lat, s.lng] : i < arr.length / 2 ? startAt : endAt) as LatLng,
    }))
    .filter((p) => p.at);
  let towns = VIA[`${from}|${to}`];
  if (!towns && VIA[`${to}|${from}`]) towns = [...VIA[`${to}|${from}`]].reverse();
  const first = stops[0]?.at ?? startAt;
  const pts = [...stops, ...(towns ?? []).map((t) => ({ name: t.name, at: t.at, kind: 'town' as const }))];
  // Điểm trả (cuối tuyến) luôn đứng cuối, còn lại xếp theo khoảng cách tới điểm xuất phát.
  const last = stops[stops.length - 1];
  return pts
    .filter((p) => p !== last)
    .sort((a, b) => km(first, a.at) - km(first, b.at))
    .concat(last ? [last] : []);
}

/** Vị trí trên đường gấp khúc ứng với tỉ lệ quãng đường t (0..1). */
function along(path: Point[], t: number) {
  const seg = path.slice(1).map((p, i) => km(path[i].at, p.at));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = total * t;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, d / seg[i]) : 1;
      const [a, b] = [path[i].at, path[i + 1].at];
      return { at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as LatLng, idx: i, done: total * t, total };
    }
    d -= seg[i];
  }
  return { at: path[0].at, idx: 0, done: 0, total };
}

const BUS_ICON = L.divIcon({
  className: 'tt-bus',
  html: '<span class="tt-bus-pulse"></span><span class="tt-bus-dot">🚌</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export function TripTracker({ b, open, onClose }: { b: Booking; open: boolean; onClose: () => void }) {
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'that' | 'thu'>('that');
  const [now, setNow] = useState(Date.now());
  const demoStart = useRef(Date.now());
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const bus = useRef<L.Marker | null>(null);
  const doneLine = useRef<L.Polyline | null>(null);

  const dep = new Date(b.trip.departAt).getTime();
  const arr = new Date(b.trip.arriveAt).getTime();
  const DEMO_MS = 60_000; // chạy thử: cả chuyến trong 60 giây

  useEffect(() => {
    if (!open || route) return;
    api<RouteInfo>(`/routes/${b.trip.routeId}`)
      .then(setRoute)
      .catch(() => setErr('Không tải được lộ trình của chuyến.'));
  }, [open, route, b.trip.routeId]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), mode === 'thu' ? 250 : 10_000);
    return () => clearInterval(t);
  }, [open, mode]);

  const path = useMemo(() => (route ? buildPath(route) : []), [route]);

  // Thời điểm "ảo": chế độ thật dùng đồng hồ máy; chạy thử tua cả chuyến trong 60 giây.
  const simNow = mode === 'thu' ? dep + ((now - demoStart.current) / DEMO_MS) * (arr - dep) : now;
  const t = Math.max(0, Math.min(1, (simNow - dep) / (arr - dep)));
  const state = simNow < dep ? 'cho' : simNow >= arr ? 'den' : 'chay';
  const pos = path.length > 1 ? along(path, t) : null;
  const next = pos ? path.slice(pos.idx + 1).find((p) => p.kind === 'stop' || p.kind === 'town') : undefined;
  const etaMin = Math.max(0, Math.round((arr - simNow) / 60000));
  // Quãng đường hiển thị: dùng số km của tuyến nếu có (đường bộ thật dài hơn đường nối thẳng các điểm).
  const totalKm = route?.distanceKm ?? (pos ? Math.round(pos.total) : 0);
  const speed = arr > dep ? Math.round(totalKm / ((arr - dep) / 3_600_000)) : 0;

  // Dựng bản đồ một lần khi đã có lộ trình.
  useEffect(() => {
    if (!open || !mapEl.current || path.length < 2 || map.current) return;
    const m = L.map(mapEl.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; Những người đóng góp OpenStreetMap',
    }).addTo(m);
    const line = path.map((p) => p.at);
    L.polyline(line, { color: '#94a3b8', weight: 5, opacity: 0.8, dashArray: '8 8' }).addTo(m);
    doneLine.current = L.polyline([], { color: '#0b7a5e', weight: 6 }).addTo(m);
    path.forEach((p, i) => {
      const isEnd = i === 0 || i === path.length - 1;
      L.circleMarker(p.at, {
        radius: isEnd ? 8 : p.kind === 'stop' ? 6 : 4,
        color: '#fff',
        weight: 2,
        fillColor: isEnd ? '#f59e0b' : p.kind === 'stop' ? '#0b7a5e' : '#64748b',
        fillOpacity: 1,
      })
        .bindTooltip(p.name, { direction: 'top', permanent: isEnd, className: 'tt-tip' })
        .addTo(m);
    });
    bus.current = L.marker(line[0], { icon: BUS_ICON, zIndexOffset: 1000 }).addTo(m);
    m.fitBounds(L.latLngBounds(line), { padding: [30, 30] });
    map.current = m;
    setTimeout(() => m.invalidateSize(), 200); // Modal vừa mở xong mới có kích thước thật
  }, [open, path]);

  // Cập nhật vị trí xe.
  useEffect(() => {
    if (!pos || !bus.current || !doneLine.current) return;
    bus.current.setLatLng(pos.at);
    doneLine.current.setLatLngs([...path.slice(0, pos.idx + 1).map((p) => p.at), pos.at]);
  }, [pos?.at[0], pos?.at[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Đóng Modal thì hủy bản đồ để lần sau dựng lại đúng kích thước.
  useEffect(() => {
    if (open) return;
    map.current?.remove();
    map.current = null;
    bus.current = null;
    doneLine.current = null;
  }, [open]);

  const follow = () => pos && map.current?.setView(pos.at, 11);

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={980} title="Theo dõi chuyến xe" destroyOnClose>
      <div className="tt">
        <div className="tt-side">
          <div className="tt-head">
            <b>
              {b.trip.originCity} → {b.trip.destinationCity}
            </b>
            <small>
              {b.trip.busType} · {b.trip.plateNumber} · Ghế {b.seats.map((s) => s.code).join(', ')}
            </small>
          </div>
          <Segmented
            block
            value={mode}
            onChange={(v) => {
              setMode(v as 'that' | 'thu');
              demoStart.current = Date.now();
              setNow(Date.now());
            }}
            options={[
              { label: 'Theo giờ thật', value: 'that', icon: <ClockCircleOutlined /> },
              { label: 'Chạy thử', value: 'thu', icon: <PlayCircleOutlined /> },
            ]}
          />
          <div className="tt-status">
            {state === 'cho' && <Tag color="gold">Chưa khởi hành · xuất bến {fmtTime(b.trip.departAt)}</Tag>}
            {state === 'chay' && <Tag color="green">Đang di chuyển</Tag>}
            {state === 'den' && <Tag color="blue">Đã đến nơi</Tag>}
            {mode === 'thu' && <Tag>Mô phỏng 60 giây</Tag>}
          </div>
          <Progress percent={Math.round(t * 100)} strokeColor="#0b7a5e" />
          {pos && (
            <dl className="tt-facts">
              <dt>Đã đi</dt>
              <dd>
                {Math.round(totalKm * t)} / {totalKm} km
              </dd>
              <dt>Điểm kế tiếp</dt>
              <dd>{state === 'den' ? '—' : next?.name ?? b.dropoffStop.name}</dd>
              <dt>Dự kiến đến</dt>
              <dd>
                {fmtTime(b.trip.arriveAt)}
                {state !== 'den' && mode === 'that' && ` (còn ${Math.floor(etaMin / 60)} giờ ${etaMin % 60} phút)`}
              </dd>
              <dt>Tốc độ trung bình</dt>
              <dd>khoảng {speed} km/h</dd>
            </dl>
          )}
          <ol className="tt-stops">
            {path.map((p, i) => {
              const passed = pos ? t >= 1 || (i <= pos.idx && t > 0) : false;
              return (
                <li key={p.name + i} className={`${passed ? 'passed' : ''} ${p.kind}`}>
                  <span className="tt-dot" />
                  <span>
                    {p.name}
                    {p.offset !== undefined && (
                      <small>{fmtTime(new Date(dep + p.offset * 60000).toISOString())}</small>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="tt-btns">
            <button className="btn-outline" onClick={follow} disabled={!pos}>
              <AimOutlined /> Tới vị trí xe
            </button>
            {mode === 'thu' && (
              <button
                className="btn-ghost"
                onClick={() => {
                  demoStart.current = Date.now();
                  setNow(Date.now());
                }}
              >
                <ReloadOutlined /> Chạy lại
              </button>
            )}
          </div>
          <p className="tt-note">
            <EnvironmentOutlined /> Vị trí xe là <b>mô phỏng</b> theo giờ chạy và lộ trình của tuyến (bản đồ án chưa gắn GPS
            trên xe). Đường vẽ nối các điểm dừng, không phải đường đi chính xác.
          </p>
        </div>
        <div className="tt-map">
          {err ? <p className="muted">{err}</p> : <div ref={mapEl} className="tt-map-el" />}
        </div>
      </div>
    </Modal>
  );
}
