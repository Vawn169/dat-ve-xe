import {
  CarOutlined,
  CloseOutlined,
  CloudOutlined,
  EnvironmentOutlined,
  LeftOutlined,
  MoonOutlined,
  PictureOutlined,
  RightOutlined,
  StarFilled,
  SunOutlined,
  SwapRightOutlined,
} from '@ant-design/icons';
import { Checkbox, Collapse, Empty, Image, Input, Radio, Rate, Skeleton, Slider, Spin, Tabs, Tag } from 'antd';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { SearchBar } from '../components/SearchBar';
import { SeatSelector } from '../components/SeatSelector';
import { addDays, addMinutes, duration, fmtDate, fmtTime, fmtYmd, hourVN, mapsLink, money, vnToday } from '../format';
import type { ReviewList, TripDetail, TripSummary } from '../types';

/** Ảnh nền thành phố đến ở đầu trang kết quả (ảnh trong public/du-lich, nguồn ghi trong nguon-anh.json) */
type CityPhoto = { img: string; tagline: string; credit?: { author: string; license: string; source: string } };
const CITY_PHOTO: Record<string, CityPhoto> = {
  'hải phòng': { img: 'hai-phong.jpg', tagline: 'Thành phố hoa phượng đỏ · vịnh Lan Hạ, Cát Bà', credit: { author: 'Velvet', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Lan_Ha_bay_jonques.jpg' } },
  'đà lạt': { img: 'da-lat.jpg', tagline: 'Thành phố ngàn hoa, sương mù và đồi thông' },
  'nha trang': { img: 'nha-trang.jpg', tagline: 'Vịnh biển xanh trong, cát trắng' },
  'cần thơ': { img: 'can-tho.jpg', tagline: 'Tây Đô sông nước, cầu Cần Thơ', credit: { author: 'Tuong Lam Photos', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Cau-can-tho-tuonglamphotos.jpg' } },
  'tp. hồ chí minh': { img: 'tp-ho-chi-minh.jpg', tagline: 'Thành phố không ngủ bên sông Sài Gòn', credit: { author: 'Radek Kucharski', license: 'CC BY 2.0', source: 'https://commons.wikimedia.org/wiki/File:Saigon_at_Blue_Hour.jpg' } },
  'vũng tàu': { img: 'vung-tau-lon.jpg', tagline: 'Biển xanh gần Sài Gòn, bãi Trước', credit: { author: 'NDTK08', license: 'CC BY 4.0', source: 'https://commons.wikimedia.org/wiki/File:Bai_Truoc_Vung_Tau.jpg' } },
  'sa pa': { img: 'sa-pa.jpg', tagline: 'Ruộng bậc thang và đỉnh Fansipan' },
  'hà nội': { img: 'ha-noi.jpg', tagline: 'Thủ đô nghìn năm văn hiến · hồ Hoàn Kiếm', credit: { author: 'P. Hughes', license: 'CC BY 4.0', source: 'https://commons.wikimedia.org/wiki/File:Hanoi_-_Turtle_Tower_(Th%C3%A1p_R%C3%B9a),_Ho%C3%A0n_Ki%E1%BA%BFm_Lake.jpg' } },
};
CITY_PHOTO['hồ chí minh'] = CITY_PHOTO['tp. hồ chí minh'];
const cityPhoto = (city: string): CityPhoto | null => CITY_PHOTO[city.trim().toLowerCase()] ?? null;

const TIME_SLOTS = [
  { value: 'early', label: 'Sáng sớm', range: '00:00 – 06:00', from: 0, to: 5, icon: <MoonOutlined /> },
  { value: 'morning', label: 'Buổi sáng', range: '06:00 – 12:00', from: 6, to: 11, icon: <SunOutlined /> },
  { value: 'afternoon', label: 'Buổi chiều', range: '12:00 – 18:00', from: 12, to: 17, icon: <CloudOutlined /> },
  { value: 'night', label: 'Buổi tối', range: '18:00 – 24:00', from: 18, to: 23, icon: <MoonOutlined /> },
];
const inSlot = (iso: string, slot: string) => {
  const s = TIME_SLOTS.find((x) => x.value === slot)!;
  const h = hourVN(iso);
  return h >= s.from && h <= s.to;
};

/** Nhóm loại xe để lọc nhanh */
const CATEGORIES = [
  { value: 'sleeper', label: 'Giường nằm', test: (t: string) => /giường nằm/i.test(t) },
  { value: 'cabin', label: 'Cabin / phòng', test: (t: string) => /cabin|phòng/i.test(t) },
  { value: 'limo', label: 'Limousine', test: (t: string) => /limousine/i.test(t) },
  { value: 'seat', label: 'Ghế ngồi', test: (t: string) => /ghế ngồi/i.test(t) },
];

type Sort = 'time' | 'price' | 'seats' | 'rating';
type InfoTab = 'stops' | 'reviews' | 'photos' | 'amen' | 'policy';

interface Credit {
  title: string;
  author: string;
  license: string;
  source: string;
}
let creditsCache: Promise<Record<string, Credit>> | null = null;
const loadCredits = () => (creditsCache ??= fetch('/xe/nguon-anh.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

const countBy = <T,>(list: T[], key: (x: T) => string | string[]) => {
  const m = new Map<string, number>();
  for (const x of list) for (const k of ([] as string[]).concat(key(x))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

/** Ảnh xe: 3 ảnh nhỏ, ảnh thứ 3 hiện "+N", bấm để xem lớn */
function PhotoStrip({ photos, name }: { photos: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  const shown = photos.slice(0, 3);
  return (
    <div className="photo-strip">
      {shown.map((src, i) => (
        <button key={src} type="button" className="thumb" onClick={() => setOpen(i)} aria-label={`Xem ảnh xe ${name} (${i + 1}/${photos.length})`}>
          <img src={src} alt="" loading="lazy" />
          {i === 2 && photos.length > 3 && <span className="more">+{photos.length - 3}</span>}
        </button>
      ))}
      <Image.PreviewGroup
        items={photos}
        preview={{ visible: open !== null, current: open ?? 0, onVisibleChange: (v) => !v && setOpen(null), onChange: (c) => setOpen(c) }}
      />
    </div>
  );
}

/** Chi tiết chuyến (F07): điểm đón/trả, đánh giá (F20), hình ảnh, tiện ích, chính sách */
function TripInfo({ tripId, tab, onTab }: { tripId: number; tab: InfoTab; onTab: (t: InfoTab) => void }) {
  const [d, setD] = useState<TripDetail | null>(null);
  const [rv, setRv] = useState<ReviewList | null>(null);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  useEffect(() => {
    api<TripDetail>(`/trips/${tripId}`).then(setD).catch(() => undefined);
    api<ReviewList>(`/trips/${tripId}/reviews`).then(setRv).catch(() => undefined);
    loadCredits().then(setCredits);
  }, [tripId]);
  if (!d) return <div className="trip-info"><Spin /></div>;
  return (
    <div className="trip-info">
      <Tabs
        size="small"
        activeKey={tab}
        onChange={(k) => onTab(k as InfoTab)}
        items={[
          {
            key: 'stops',
            label: 'Điểm đón / trả',
            children: (
              <ol className="route-steps">
                {d.route.stops.map((s) => (
                  <li key={s.id}>
                    <b>{fmtTime(addMinutes(d.departAt, s.offsetMinutes))}</b> {s.type === 'DROPOFF' ? 'Trả' : 'Đón'} · {s.name}
                    <small>
                      {s.address} · <a href={mapsLink(s)} target="_blank" rel="noreferrer">Xem bản đồ</a>
                    </small>
                  </li>
                ))}
              </ol>
            ),
          },
          {
            key: 'reviews',
            label: `Đánh giá${rv?.count ? ` (${rv.count})` : ''}`,
            children: !rv?.count ? (
              <span className="muted">Chưa có đánh giá cho tuyến này.</span>
            ) : (
              <div className="reviews">
                <div className="rv-head">
                  <b>{rv.average}</b>/5 <Rate disabled allowHalf value={rv.average ?? 0} /> · {rv.count} đánh giá
                </div>
                {rv.reviews.slice(0, 5).map((r) => (
                  <div className="rv" key={r.id}>
                    <Rate disabled value={r.rating} /> <b>{r.author}</b> <span className="muted">· chuyến {fmtDate(r.tripDate)}</span>
                    {r.comment && <p>{r.comment}</p>}
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'photos',
            label: `Hình ảnh (${d.bus.photos.length})`,
            children: d.bus.photos.length ? (
              <>
                <Image.PreviewGroup>
                  <div className="photo-grid">
                    {d.bus.photos.map((src) => (
                      <Image key={src} src={src} alt={`Ảnh xe ${d.bus.busType}`} />
                    ))}
                  </div>
                </Image.PreviewGroup>
                <p className="credits">
                  Ảnh minh họa loại xe, không phải xe của nhà xe này. Nguồn: Wikimedia Commons ·{' '}
                  {d.bus.photos
                    .map((src) => credits[src.split('/').pop() ?? ''])
                    .filter(Boolean)
                    .map((c, i) => (
                      <span key={i}>
                        {i > 0 && ' · '}
                        <a href={c.source} target="_blank" rel="noreferrer">
                          {c.author || 'tác giả'}
                        </a>{' '}
                        ({c.license})
                      </span>
                    ))}
                </p>
              </>
            ) : (
              <span className="muted">Nhà xe chưa cập nhật ảnh.</span>
            ),
          },
          {
            key: 'amen',
            label: 'Tiện ích',
            children: (
              <div className="amen-list">
                {d.bus.amenities.length ? d.bus.amenities.map((a) => <Tag key={a} color="green">{a}</Tag>) : <span className="muted">Chưa cập nhật</span>}
                <p className="muted">
                  {d.bus.busType} · Biển số {d.bus.plateNumber} · {d.route.operator.name}
                  {d.route.operator.hotline ? ` · Hotline ${d.route.operator.hotline}` : ''}
                </p>
              </div>
            ),
          },
          {
            key: 'policy',
            label: 'Chính sách hủy',
            children: (
              <ul className="policy">
                <li>Hủy trước giờ chạy từ 24 giờ: phí 10%. Từ 4 đến dưới 24 giờ: phí 30%. Dưới 4 giờ: không hủy được.</li>
                <li>Đổi sang chuyến khác cùng tuyến trước giờ chạy ít nhất 12 giờ, miễn phí đổi.</li>
                <li>Có mặt tại điểm đón trước 30 phút. Mang theo mã vé hoặc mã QR.</li>
                <li>Hành lý: 20 kg ký gửi và 1 túi xách nhỏ. Trẻ từ 5 tuổi mua vé riêng.</li>
              </ul>
            ),
          },
        ]}
      />
    </div>
  );
}

/** Danh sách ô chọn có ô tìm (dùng cho nhà xe, điểm đón, điểm trả khi danh sách dài) */
function CheckList({ options, value, onChange, searchable, placeholder }: { options: { value: string; label: ReactNode; text: string; count: number }[]; value: string[]; onChange: (v: string[]) => void; searchable?: boolean; placeholder?: string }) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => !q || o.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="checklist">
      {searchable && options.length > 5 && <Input size="small" allowClear placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />}
      <Checkbox.Group className="vlist" value={value} onChange={(v) => onChange(v as string[])}>
        {shown.map((o) => (
          <Checkbox key={o.value} value={o.value}>
            <span className="opt">
              {o.label}
              <span className="cnt">{o.count}</span>
            </span>
          </Checkbox>
        ))}
      </Checkbox.Group>
      {!shown.length && <span className="muted">Không có kết quả</span>}
    </div>
  );
}

export function SearchResults() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const date = params.get('date') ?? vnToday();
  const wantTrip = Number(params.get('trip')) || null;

  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [arrSlots, setArrSlots] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [ops, setOps] = useState<string[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [drops, setDrops] = useState<string[]>([]);
  const [amen, setAmen] = useState<string[]>([]);
  const [price, setPrice] = useState<[number, number] | null>(null);
  const [minRating, setMinRating] = useState<number>(0);
  const [sort, setSort] = useState<Sort>('time');
  const [openId, setOpenId] = useState<number | null>(wantTrip);
  const [info, setInfo] = useState<{ id: number; tab: InfoTab } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setTrips(null);
    setError(null);
    setOpenId(wantTrip);
    setInfo(null);
    api<TripSummary[]>(`/trips?${new URLSearchParams({ from, to, date })}`)
      .then((t) => {
        setTrips(t);
        setPrice(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được danh sách chuyến'));
  }, [from, to, date]);

  // Dải 7 ngày quanh ngày đang xem, kèm giá thấp nhất mỗi ngày (giống thiết kế Stitch).
  const days = useMemo(() => {
    const today = vnToday();
    let start = addDays(date, -3);
    if (start < today) start = today;
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);
  const [dayMin, setDayMin] = useState<Record<string, number | null>>({});
  useEffect(() => {
    setDayMin({});
    for (const d of days)
      api<TripSummary[]>(`/trips?${new URLSearchParams({ from, to, date: d })}`)
        .then((ts) => setDayMin((o) => ({ ...o, [d]: ts.length ? Math.min(...ts.map((t) => t.basePrice)) : null })))
        .catch(() => undefined);
  }, [from, to, days.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = trips ?? [];
  const facets = useMemo(() => {
    const ps = all.map((t) => t.basePrice);
    const opNames = new Map(all.map((t) => [String(t.operatorId), { name: t.operatorName, logo: t.operatorLogo }]));
    return {
      slot: countBy(all, (t) => TIME_SLOTS.filter((s) => inSlot(t.departAt, s.value)).map((s) => s.value)),
      arr: countBy(all, (t) => TIME_SLOTS.filter((s) => inSlot(t.arriveAt, s.value)).map((s) => s.value)),
      cat: countBy(all, (t) => CATEGORIES.filter((c) => c.test(t.busType)).map((c) => c.value)),
      type: countBy(all, (t) => t.busType),
      op: countBy(all, (t) => String(t.operatorId)),
      opNames,
      pick: countBy(all, (t) => [...new Set(t.pickups.map((s) => s.name))]),
      drop: countBy(all, (t) => [...new Set(t.dropoffs.map((s) => s.name))]),
      amen: countBy(all, (t) => t.amenities),
      rating4: all.filter((t) => (t.rating ?? 0) >= 4).length,
      priceRange: (ps.length ? [Math.min(...ps), Math.max(...ps)] : [0, 0]) as [number, number],
    };
  }, [trips]);

  const shown = useMemo(() => {
    const list = all.filter(
      (t) =>
        (!slots.length || slots.some((s) => inSlot(t.departAt, s))) &&
        (!arrSlots.length || arrSlots.some((s) => inSlot(t.arriveAt, s))) &&
        (!cats.length || CATEGORIES.some((c) => cats.includes(c.value) && c.test(t.busType))) &&
        (!types.length || types.includes(t.busType)) &&
        (!ops.length || ops.includes(String(t.operatorId))) &&
        (!picks.length || t.pickups.some((s) => picks.includes(s.name))) &&
        (!drops.length || t.dropoffs.some((s) => drops.includes(s.name))) &&
        (!amen.length || amen.every((a) => t.amenities.includes(a))) &&
        (!price || (t.basePrice >= price[0] && t.basePrice <= price[1])) &&
        (!minRating || (t.rating ?? 0) >= minRating),
    );
    const by: Record<Sort, (a: TripSummary, b: TripSummary) => number> = {
      time: (a, b) => a.departAt.localeCompare(b.departAt),
      price: (a, b) => a.basePrice - b.basePrice,
      seats: (a, b) => b.availableSeats - a.availableSeats,
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    };
    return [...list].sort(by[sort]);
  }, [trips, slots, arrSlots, cats, types, ops, picks, drops, amen, price, minRating, sort]);

  const goDate = (d: string) => nav(`/tim-chuyen?${new URLSearchParams({ from, to, date: d })}`);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const clear = () => {
    setSlots([]);
    setArrSlots([]);
    setCats([]);
    setTypes([]);
    setOps([]);
    setPicks([]);
    setDrops([]);
    setAmen([]);
    setPrice(null);
    setMinRating(0);
  };
  const nFilters = slots.length + arrSlots.length + cats.length + types.length + ops.length + picks.length + drops.length + amen.length + (price ? 1 : 0) + (minRating ? 1 : 0);

  // Các lựa chọn đang bật, hiện thành nhãn có nút xóa phía trên danh sách
  const active: { key: string; label: string; remove: () => void }[] = [
    ...slots.map((v) => ({ key: `s${v}`, label: `Đi ${TIME_SLOTS.find((s) => s.value === v)!.label.toLowerCase()}`, remove: () => toggle(slots, setSlots, v) })),
    ...arrSlots.map((v) => ({ key: `a${v}`, label: `Đến ${TIME_SLOTS.find((s) => s.value === v)!.label.toLowerCase()}`, remove: () => toggle(arrSlots, setArrSlots, v) })),
    ...cats.map((v) => ({ key: `c${v}`, label: CATEGORIES.find((c) => c.value === v)!.label, remove: () => toggle(cats, setCats, v) })),
    ...types.map((v) => ({ key: `t${v}`, label: v, remove: () => toggle(types, setTypes, v) })),
    ...ops.map((v) => ({ key: `o${v}`, label: facets.opNames.get(v)?.name ?? v, remove: () => toggle(ops, setOps, v) })),
    ...picks.map((v) => ({ key: `p${v}`, label: `Đón: ${v}`, remove: () => toggle(picks, setPicks, v) })),
    ...drops.map((v) => ({ key: `d${v}`, label: `Trả: ${v}`, remove: () => toggle(drops, setDrops, v) })),
    ...amen.map((v) => ({ key: `m${v}`, label: v, remove: () => toggle(amen, setAmen, v) })),
    ...(minRating ? [{ key: 'r', label: `Từ ${String(minRating).replace('.', ',')} sao`, remove: () => setMinRating(0) }] : []),
    ...(price ? [{ key: 'pr', label: `${money(price[0])} – ${money(price[1])}`, remove: () => setPrice(null) }] : []),
  ];

  const opts = (m: Map<string, number>, label?: (k: string) => ReactNode, text?: (k: string) => string) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: label ? label(k) : k, text: text ? text(k) : k, count: n }));
  const slotOpts = (m: Map<string, number>) =>
    TIME_SLOTS.map((s) => ({ value: s.value, label: <>{s.label} <span className="muted">({s.range})</span></>, text: s.label, count: m.get(s.value) ?? 0 }));

  const chip = (on: boolean, onClick: () => void, children: ReactNode, key: string, disabled = false) => (
    <button key={key} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );

  const pr = facets.priceRange;
  const sections = [
    { key: 'depart', label: 'Giờ khởi hành', n: slots.length, children: <CheckList options={slotOpts(facets.slot)} value={slots} onChange={setSlots} /> },
    { key: 'arrive', label: 'Giờ đến', n: arrSlots.length, children: <CheckList options={slotOpts(facets.arr)} value={arrSlots} onChange={setArrSlots} /> },
    { key: 'type', label: 'Loại xe', n: types.length, children: <CheckList options={opts(facets.type)} value={types} onChange={setTypes} /> },
    {
      key: 'op',
      label: 'Nhà xe',
      n: ops.length,
      children: (
        <CheckList
          searchable
          placeholder="Tìm nhà xe"
          options={opts(
            facets.op,
            (k) => (
              <span className="op-opt">
                {facets.opNames.get(k)?.logo && <img src={facets.opNames.get(k)!.logo!} alt="" />}
                {facets.opNames.get(k)?.name}
              </span>
            ),
            (k) => facets.opNames.get(k)?.name ?? '',
          )}
          value={ops}
          onChange={setOps}
        />
      ),
    },
    { key: 'pick', label: 'Điểm đón', n: picks.length, children: <CheckList searchable placeholder="Tìm điểm đón" options={opts(facets.pick)} value={picks} onChange={setPicks} /> },
    { key: 'drop', label: 'Điểm trả', n: drops.length, children: <CheckList searchable placeholder="Tìm điểm trả" options={opts(facets.drop)} value={drops} onChange={setDrops} /> },
    { key: 'amen', label: 'Tiện ích trên xe', n: amen.length, children: <CheckList options={opts(facets.amen)} value={amen} onChange={setAmen} /> },
    {
      key: 'rating',
      label: 'Đánh giá',
      n: minRating ? 1 : 0,
      children: (
        <Radio.Group className="vlist" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
          <Radio value={0}>Tất cả</Radio>
          <Radio value={4}>Từ 4 sao</Radio>
          <Radio value={4.5}>Từ 4,5 sao</Radio>
        </Radio.Group>
      ),
    },
    ...(pr[1] > pr[0]
      ? [
          {
            key: 'price',
            label: 'Giá vé',
            n: price ? 1 : 0,
            children: (
              <>
                <Slider range min={pr[0]} max={pr[1]} step={10000} value={price ?? pr} onChange={(v) => setPrice(v as [number, number])} tooltip={{ formatter: (v) => money(v ?? 0) }} />
                <div className="price-range">
                  {money((price ?? pr)[0])} – {money((price ?? pr)[1])}
                </div>
              </>
            ),
          },
        ]
      : []),
  ];

  const pickChips = opts(facets.pick);
  const art = cityPhoto(to);

  return (
    <>
      <div className={`results-top city-hero ${art ? 'has-photo' : ''}`} style={art ? { backgroundImage: `url(/du-lich/${art.img})` } : undefined}>
        <div className="container">
          {to && (
            <div className="city-caption">
              <span className="cc-label">Điểm đến</span>
              <b>{to}</b>
              {art?.tagline && <span className="cc-tag">{art.tagline}</span>}
            </div>
          )}
          <SearchBar compact initial={{ from, to, date }} />
          <div className="route-sum">
            <span className="rs-icon">
              <CarOutlined />
            </span>
            <div className="rs-main">
              <b>
                {from} <SwapRightOutlined /> {to}
              </b>
              <small>
                {fmtYmd(date)}
                {trips ? ` · ${all.length} chuyến` : ''}
              </small>
            </div>
            <span className="rs-safe">Giữ đúng số chỗ · Vé điện tử QR</span>
          </div>
          <div className="date-strip">
            <button className="ds-arrow" disabled={date <= vnToday()} onClick={() => goDate(addDays(date, -1))} aria-label="Ngày trước">
              <LeftOutlined />
            </button>
            {days.map((d) => {
              const [wd, dm] = fmtYmd(d).split(', ');
              const m = dayMin[d];
              return (
                <button key={d} className={`ds-day ${d === date ? 'on' : ''}`} onClick={() => goDate(d)} aria-current={d === date}>
                  <span>{wd}</span>
                  <b>{dm?.slice(0, 5)}</b>
                  <small>{m === undefined ? '…' : m === null ? 'Hết chuyến' : `từ ${Math.round(m / 1000)}k`}</small>
                </button>
              );
            })}
            <button className="ds-arrow" onClick={() => goDate(addDays(date, 1))} aria-label="Ngày sau">
              <RightOutlined />
            </button>
          </div>
          {art?.credit && (
            <a className="city-credit" href={art.credit.source} target="_blank" rel="noreferrer">
              Ảnh: {art.credit.author} · {art.credit.license}
            </a>
          )}
        </div>
      </div>

      <div className="container results-layout">
        <aside className={`filters ${showFilters ? 'show' : ''}`}>
          <button className="filters-toggle" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            Bộ lọc{nFilters ? ` (${nFilters})` : ''} {showFilters ? '▲' : '▼'}
          </button>
          <div className="filters-head">
            <h3>Bộ lọc</h3>
            {nFilters > 0 && (
              <button className="link" onClick={clear}>
                Xóa lọc ({nFilters})
              </button>
            )}
          </div>
          <div className="quick-chips">
            {TIME_SLOTS.map((s) => chip(slots.includes(s.value), () => toggle(slots, setSlots, s.value), <span title={s.range}>{s.icon} {s.label} <span className="cnt">({facets.slot.get(s.value) ?? 0})</span></span>, s.value, !facets.slot.get(s.value) && !slots.includes(s.value)))}
            {CATEGORIES.map((c) => chip(cats.includes(c.value), () => toggle(cats, setCats, c.value), <><CarOutlined /> {c.label} <span className="cnt">({facets.cat.get(c.value) ?? 0})</span></>, c.value, !facets.cat.get(c.value) && !cats.includes(c.value)))}
            {chip(minRating === 4, () => setMinRating(minRating === 4 ? 0 : 4), <><StarFilled /> Từ 4 sao <span className="cnt">({facets.rating4})</span></>, 'r4')}
          </div>
          <Collapse
            ghost
            className="filter-sections"
            defaultActiveKey={['depart', 'type', 'op']}
            expandIconPosition="end"
            items={sections.map((s) => ({ key: s.key, label: <b>{s.label}{s.n ? <span className="badge">{s.n}</span> : null}</b>, children: s.children }))}
          />
        </aside>

        <main className="results">
          {pickChips.length > 1 && (
            <div className="pick-bar">
              <span className="muted">
                <EnvironmentOutlined /> Lọc nhanh theo điểm đón
              </span>
              <div className="pick-chips">
                {pickChips.map((o) => chip(picks.includes(o.value), () => toggle(picks, setPicks, o.value), <>{o.value} ({o.count})</>, o.value))}
              </div>
            </div>
          )}

          <div className="results-bar">
            <div className="rb-title">
              <h2>
                {from} đi {to}
              </h2>
              <span className="muted">{trips ? `Tìm thấy ${shown.length} chuyến` : 'Đang tìm chuyến…'}</span>
            </div>
            <Radio.Group value={sort} onChange={(e) => setSort(e.target.value)} optionType="button" size="small">
              <Radio.Button value="time">Giờ đi sớm nhất</Radio.Button>
              <Radio.Button value="price">Giá thấp nhất</Radio.Button>
              <Radio.Button value="rating">Đánh giá cao</Radio.Button>
              <Radio.Button value="seats">Nhiều ghế trống</Radio.Button>
            </Radio.Group>
          </div>
          {active.length > 0 && (
            <div className="active-filters">
              {active.map((a) => (
                <button key={a.key} type="button" className="chip on" onClick={a.remove} aria-label={`Bỏ lọc ${a.label}`}>
                  {a.label} <CloseOutlined />
                </button>
              ))}
              <button className="link" onClick={clear}>
                Xóa tất cả
              </button>
            </div>
          )}

          {error && <div className="error-box">{error}</div>}
          {!trips && !error && <Skeleton active paragraph={{ rows: 6 }} />}
          {trips && !shown.length && <Empty description={trips.length ? 'Không có chuyến khớp bộ lọc' : 'Không có chuyến nào trong ngày này. Thử ngày khác nhé.'} />}

          {shown.map((t) => {
            const pick = t.pickups[0];
            const drop = t.dropoffs[t.dropoffs.length - 1];
            const infoTab = info?.id === t.id ? info.tab : null;
            const openTab = (tab: InfoTab) => setInfo(infoTab === tab ? null : { id: t.id, tab });
            return (
              <article key={t.id} className={`trip-card ${openId === t.id ? 'open' : ''}`}>
                <div className="trip-main">
                  <div className="trip-op">
                    <div className="op-head">
                      {t.operatorLogo && <img className="op-logo" src={t.operatorLogo} alt={`Logo ${t.operatorName}`} />}
                      {t.rating !== null ? (
                        <span className="rating-badge" title={`${t.ratingCount} đánh giá`}>
                          <StarFilled /> {t.rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="muted rating">Chưa có đánh giá</span>
                      )}
                    </div>
                    <h3>{t.operatorName}</h3>
                    <div className="bus-type">{t.busType}</div>
                    <PhotoStrip photos={t.photos} name={t.operatorName} />
                  </div>
                  <div className="trip-time">
                    <div>
                      <b>{fmtTime(t.departAt)}</b>
                      <span>{pick?.name ?? t.originCity}</span>
                    </div>
                    <div className="trip-dur">
                      <span>{duration(t.departAt, t.arriveAt)}</span>
                      <i className="trip-line">
                        <CarOutlined />
                      </i>
                    </div>
                    <div className="to">
                      <b>{fmtTime(t.arriveAt)}</b>
                      <span>{drop?.name ?? t.destinationCity}</span>
                    </div>
                  </div>
                  <div className="trip-price">
                    <span className="from">Giá từ</span>
                    <b>{money(t.basePrice)}</b>
                    <span className={`seats-left ${t.availableSeats <= 5 ? 'low' : ''}`}>
                      Còn {t.availableSeats}/{t.totalSeats} chỗ
                    </span>
                    <div className="trip-btns">
                      <button className={openId === t.id ? 'btn-outline' : 'btn-primary'} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                        {openId === t.id ? 'Đóng' : 'Chọn ghế'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="trip-foot">
                  <div className="trip-links" role="group" aria-label="Thông tin chuyến">
                    {(
                      [
                        ['stops', 'Điểm đón / trả'],
                        ['reviews', 'Đánh giá'],
                        ['photos', 'Hình ảnh'],
                        ['amen', 'Tiện ích'],
                        ['policy', 'Chính sách hủy'],
                      ] as [InfoTab, string][]
                    ).map(([k, label]) => (
                      <button key={k} type="button" className={infoTab === k ? 'on' : ''} aria-expanded={infoTab === k} onClick={() => openTab(k)}>
                        {k === 'photos' && <PictureOutlined />} {label}
                      </button>
                    ))}
                  </div>
                  <div className="trip-tags">
                    {t.amenities.slice(0, 3).map((a) => (
                      <span key={a} className="tag-soft">
                        {a}
                      </span>
                    ))}
                    <span className="tag-soft blue">Xác nhận ngay</span>
                    <span className="tag-soft blue">Có thể hủy</span>
                  </div>
                </div>
                {infoTab && <TripInfo tripId={t.id} tab={infoTab} onTab={(tab) => setInfo({ id: t.id, tab })} />}
                {openId === t.id && <SeatSelector tripId={t.id} busType={t.busType} departAt={t.departAt} />}
              </article>
            );
          })}
        </main>
      </div>
    </>
  );
}
