// Trang chủ phong cách du lịch, dựng theo thiết kế Google Stitch (stitch-thiet-ke/man/trang_ch_c_ng_du_l_ch_...).
// Mọi con số (giá từ, thời gian, nhà xe) lấy từ API; không dùng số liệu minh họa của Stitch.
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  FileDoneOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SearchBar } from '../components/SearchBar';
import { addDays, vnToday } from '../format';
import { message } from '../notify';
import type { RouteInfo, TripSummary } from '../types';

const BENEFITS = [
  { icon: <ThunderboltOutlined />, title: 'Chọn ghế trực tiếp', text: 'Sơ đồ ghế từng tầng, đổi màu ngay khi có người chọn.' },
  { icon: <ClockCircleOutlined />, title: 'Giữ ghế 10 phút', text: 'Ghế được giữ riêng trong lúc bạn nhập thông tin.' },
  { icon: <SafetyCertificateOutlined />, title: 'Không bán trùng ghế', text: 'Mỗi ghế chỉ bán cho đúng một người.' },
  { icon: <FileDoneOutlined />, title: 'Vé điện tử QR', text: 'Tra cứu, đổi, hủy vé ngay trên web.' },
];

/** Ảnh và lời giới thiệu theo điểm đến; thành phố chưa có ảnh dùng nền màu. */
const PLACES: Record<string, { img?: string; tag: string; line: string; tint: string }> = {
  'Đà Lạt': { img: '/du-lich/da-lat.jpg', tag: 'Săn mây', line: 'Thành phố sương mù và đồi thông', tint: '#3f6b4f' },
  'Nha Trang': { img: '/du-lich/nha-trang.jpg', tag: 'Biển đảo', line: 'Vịnh biển xanh trong, cát trắng', tint: '#0e7490' },
  'Sa Pa': { img: '/du-lich/sa-pa.jpg', tag: 'Núi rừng', line: 'Ruộng bậc thang và đỉnh Fansipan', tint: '#a16207' },
  'Vũng Tàu': { img: '/du-lich/vung-tau.jpg', tag: 'Cuối tuần', line: 'Biển gần Sài Gòn, đi về trong ngày', tint: '#c2410c' },
  'Cần Thơ': { tag: 'Miền Tây', line: 'Chợ nổi Cái Răng, vườn trái cây', tint: '#15803d' },
  'Hải Phòng': { tag: 'Ẩm thực', line: 'Thành phố hoa phượng, cửa ngõ Cát Bà', tint: '#be123c' },
};

const THEMES = [
  {
    img: '/du-lich/da-lat.jpg',
    season: 'Tháng 10 – tháng 4',
    title: 'Săn mây và check-in đồi chè Đà Lạt',
    text: 'Đi chuyến tối, sáng sớm tới nơi là kịp ngắm mây trên đồi.',
    chips: ['Xe giường nằm đêm', 'Khí hậu mát quanh năm'],
    to: 'Đà Lạt',
  },
  {
    img: '/du-lich/nha-trang.jpg',
    season: 'Tháng 1 – tháng 8',
    title: 'Biển xanh và lặn ngắm san hô Nha Trang',
    text: 'Biển êm, nắng đẹp; nên đặt sớm vào dịp hè và lễ.',
    chips: ['Biển đảo', 'Hợp đi nhóm, gia đình'],
    to: 'Nha Trang',
  },
  {
    img: '/du-lich/sa-pa.jpg',
    season: 'Tháng 9 – tháng 10',
    title: 'Mùa lúa chín trên ruộng bậc thang Sa Pa',
    text: 'Từ Hà Nội đi đường cao tốc, ngủ một giấc là tới thị xã.',
    chips: ['Mùa lúa vàng', 'Trekking bản làng'],
    to: 'Sa Pa',
  },
];

/** Mã giảm giá có thật trong dữ liệu mẫu (backend/prisma/seed.ts). */
const COUPONS = [
  { code: 'GIAM10', big: '10%', title: 'Giảm 10% mọi tuyến', note: 'Tối đa 50.000đ' },
  { code: 'CHAOBAN', big: '30K', title: 'Giảm 30.000đ', note: 'Cho đơn từ 200.000đ' },
];

const TIPS = [
  {
    img: '/du-lich/hoi-an.jpg',
    tag: 'Kinh nghiệm',
    title: 'Chọn ghế nào trên xe giường nằm để ngủ ngon?',
    text: 'Tầng dưới đỡ say xe, ghế giữa xe ít xóc hơn ghế cuối. Mang áo khoác vì máy lạnh khá lạnh về đêm.',
  },
  {
    img: '/du-lich/da-lat.jpg',
    tag: 'Chuẩn bị',
    title: 'Đi Đà Lạt cần mang gì?',
    text: 'Áo ấm, giày đi bộ, ô gấp. Sáng sớm trời lạnh, trưa nắng nhẹ.',
  },
  {
    img: '/du-lich/vung-tau.jpg',
    tag: 'Mẹo đặt vé',
    title: 'Đặt vé dịp lễ thế nào cho chắc?',
    text: 'Đặt trước vài ngày và thanh toán ngay để vé được xác nhận; vé điện tử có mã QR, không cần in.',
  },
];

interface Dest {
  from: string;
  to: string;
  minutes: number | null;
  minPrice?: number;
  count?: number;
  logos: string[];
}

const money = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export function Home() {
  const nav = useNavigate();
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [trips, setTrips] = useState<Record<string, TripSummary[]>>({});
  const tomorrow = addDays(vnToday(), 1);

  useEffect(() => {
    api<RouteInfo[]>('/routes').then(setRoutes).catch(() => undefined);
  }, []);

  // Mỗi cặp điểm đi – điểm đến chỉ hiện một lần (dữ liệu có nhiều tuyến trùng cặp của các nhà xe khác nhau).
  const pairs = useMemo(() => {
    const m = new Map<string, Dest>();
    for (const r of routes) {
      const k = `${r.originCity}|${r.destinationCity}`;
      if (!m.has(k)) m.set(k, { from: r.originCity, to: r.destinationCity, minutes: r.durationMinutes, logos: [] });
    }
    return [...m.values()];
  }, [routes]);

  useEffect(() => {
    for (const p of pairs) {
      const k = `${p.from}|${p.to}`;
      api<TripSummary[]>(`/trips?${new URLSearchParams({ from: p.from, to: p.to, date: tomorrow })}`)
        .then((ts) => setTrips((o) => ({ ...o, [k]: ts })))
        .catch(() => undefined);
    }
  }, [pairs, tomorrow]);

  const dests: Dest[] = pairs.map((p) => {
    const ts = trips[`${p.from}|${p.to}`];
    if (!ts) return p;
    return {
      ...p,
      minPrice: ts.length ? Math.min(...ts.map((t) => t.basePrice)) : undefined,
      count: ts.length,
      logos: [...new Set(ts.map((t) => t.operatorLogo).filter(Boolean) as string[])].slice(0, 4),
    };
  });

  const operators = useMemo(() => {
    const m = new Map<string, { name: string; logo: string | null }>();
    for (const ts of Object.values(trips)) for (const t of ts) m.set(t.operatorName, { name: t.operatorName, logo: t.operatorLogo });
    return [...m.values()];
  }, [trips]);

  const go = (from: string, to: string) => nav(`/tim-chuyen?${new URLSearchParams({ from, to, date: tomorrow })}`);
  const copy = (code: string) => {
    if (!navigator.clipboard) return message.info(`Mã giảm giá: ${code}`);
    navigator.clipboard.writeText(code).then(
      () => message.success(`Đã chép mã ${code}`),
      () => message.info(`Mã giảm giá: ${code}`),
    );
  };

  return (
    <div className="home">
      {/* ---- Ảnh lớn đầu trang + ô tìm chuyến ---- */}
      <section className="th-hero" style={{ backgroundImage: 'url(/du-lich/da-lat.jpg)' }}>
        <div className="container th-hero-inner">
          <span className="th-pill">
            <EnvironmentOutlined /> Đặt vé xe khách liên tỉnh, chọn đúng ghế bạn muốn
          </span>
          <h1>
            Khám phá Việt Nam
            <span>trên mỗi chuyến xe</span>
          </h1>
          <p>So sánh nhà xe, xem sơ đồ ghế trực tiếp và nhận vé điện tử ngay sau khi thanh toán.</p>
          <div className="th-search">
            <SearchBar />
            {pairs.length > 0 && (
              <div className="th-quick">
                <span>Đi nhanh:</span>
                {pairs.slice(0, 6).map((p) => (
                  <button key={p.from + p.to} type="button" onClick={() => go(p.from, p.to)}>
                    {p.to}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="container th-benefits">
        {BENEFITS.map((b) => (
          <div key={b.title} className="th-benefit">
            <span className="th-benefit-icon">{b.icon}</span>
            <div>
              <b>{b.title}</b>
              <small>{b.text}</small>
            </div>
          </div>
        ))}
      </section>

      {/* ---- Điểm đến (dữ liệu tuyến thật) ---- */}
      <section className="container section">
        <div className="th-head">
          <span className="th-eyebrow">Mạng lưới điểm đến</span>
          <h2>Điểm đến nổi bật</h2>
          <p className="muted">Giá thấp nhất của các chuyến ngày mai, lấy trực tiếp từ hệ thống đặt vé.</p>
        </div>
        <div className="dest-grid">
          {dests.map((d) => {
            const pl = PLACES[d.to] ?? { tag: 'Tuyến xe', line: `${d.from} đi ${d.to}`, tint: '#0b7a5e' };
            return (
              <button key={d.from + d.to} className="route-card dest-card" onClick={() => go(d.from, d.to)}>
                <span
                  className="dest-img"
                  style={pl.img ? { backgroundImage: `url(${pl.img})` } : { background: `linear-gradient(135deg, ${pl.tint}, #0b7a5e)` }}
                >
                  <span className="dest-tag">{pl.tag}</span>
                  <span className="dest-name">
                    <b>{d.to}</b>
                    <small>{pl.line}</small>
                  </span>
                </span>
                <span className="dest-body">
                  <span className="rc-cities">
                    {d.from} <ArrowRightOutlined /> {d.to}
                  </span>
                  <span className="rc-meta">
                    {d.minutes ? `Khoảng ${Math.round(d.minutes / 60)} giờ` : ''}
                    {d.count !== undefined && ` · ${d.count} chuyến ngày mai`}
                  </span>
                  <span className="dest-foot">
                    <span>
                      {d.minPrice !== undefined ? (
                        <>
                          <small>Giá từ</small>
                          <b className="dest-price">{money(d.minPrice)}</b>
                        </>
                      ) : (
                        <small>{d.count === 0 ? 'Ngày mai chưa có chuyến' : 'Đang tải giá…'}</small>
                      )}
                    </span>
                    <span className="rc-cta">
                      Xem chuyến <ArrowRightOutlined />
                    </span>
                  </span>
                  {d.logos.length > 0 && (
                    <span className="dest-logos">
                      {d.logos.map((l) => (
                        <img key={l} src={l} alt="" />
                      ))}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {!routes.length && <p className="muted">Chưa tải được danh sách tuyến. Kiểm tra backend đã chạy chưa.</p>}
        </div>
      </section>

      {/* ---- Gợi ý hành trình ---- */}
      <section className="th-band">
        <div className="container section">
          <div className="th-head center">
            <span className="th-eyebrow">Cảm hứng cho chuyến đi</span>
            <h2>Gợi ý hành trình theo mùa</h2>
            <p className="muted">Chọn một chủ đề, xem ngay các chuyến xe phù hợp.</p>
          </div>
          <div className="theme-grid">
            {THEMES.map((t) => {
              const p = pairs.find((x) => x.to === t.to);
              return (
                <article key={t.title} className="theme-card">
                  <div className="theme-img" style={{ backgroundImage: `url(${t.img})` }}>
                    <span className="theme-season">{t.season}</span>
                  </div>
                  <div className="theme-body">
                    <h3>{t.title}</h3>
                    <p className="muted">{t.text}</p>
                    <div className="theme-chips">
                      {t.chips.map((c) => (
                        <span key={c}>
                          <CheckCircleFilled /> {c}
                        </span>
                      ))}
                    </div>
                    {p && (
                      <button className="btn-primary" onClick={() => go(p.from, p.to)}>
                        Xem chuyến đi {t.to} <ArrowRightOutlined />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- Ưu đãi ---- */}
      <section className="container section">
        <div className="th-head">
          <span className="th-eyebrow">Tiết kiệm hơn</span>
          <h2>Ưu đãi và mã giảm giá</h2>
        </div>
        <div className="promo-grid">
          {COUPONS.map((c) => (
            <div key={c.code} className="promo">
              <div className="promo-big">{c.big}</div>
              <div className="promo-body">
                <b>{c.title}</b>
                <small>{c.note} · nhập ở bước thanh toán</small>
                <span className="promo-code">
                  <code>{c.code}</code>
                  <button type="button" className="link" onClick={() => copy(c.code)}>
                    <CopyOutlined /> Sao chép
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Cẩm nang ---- */}
      <section className="container section">
        <div className="th-head">
          <span className="th-eyebrow">Cẩm nang</span>
          <h2>Mẹo đi xe khách và du lịch</h2>
        </div>
        <div className="theme-grid">
          {TIPS.map((t) => (
            <article key={t.title} className="theme-card tip">
              <div className="theme-img short" style={{ backgroundImage: `url(${t.img})` }}>
                <span className="theme-season">{t.tag}</span>
              </div>
              <div className="theme-body">
                <h3>{t.title}</h3>
                <p className="muted">{t.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Nhà xe (lấy từ chuyến thật) ---- */}
      {operators.length > 0 && (
        <section className="container section">
          <div className="th-head center">
            <h2>Các nhà xe đang mở bán</h2>
            <p className="muted">Tên và logo nhà xe là dữ liệu mẫu của đồ án.</p>
          </div>
          <div className="op-strip">
            {operators.map((o) => (
              <div key={o.name} className="op-chip" title={o.name}>
                {o.logo ? <img src={o.logo} alt={o.name} /> : <span>{o.name}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
