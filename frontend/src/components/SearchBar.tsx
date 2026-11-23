import { CalendarOutlined, EnvironmentOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons';
import { AutoComplete, DatePicker} from 'antd';
import { message } from '../notify';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { addDays, vnToday } from '../format';
import type { RouteInfo } from '../types';

let citiesCache: string[] | null = null;

export function useCities() {
  const [cities, setCities] = useState<string[]>(citiesCache ?? []);
  useEffect(() => {
    if (citiesCache) return;
    api<RouteInfo[]>('/routes')
      .then((rs) => {
        citiesCache = [...new Set(rs.flatMap((r) => [r.originCity, r.destinationCity]))].sort();
        setCities(citiesCache);
      })
      .catch(() => undefined);
  }, []);
  return cities;
}

export function SearchBar({ initial, compact = false }: { initial?: { from: string; to: string; date: string }; compact?: boolean }) {
  const nav = useNavigate();
  const cities = useCities();
  const [from, setFrom] = useState(initial?.from ?? '');
  const [to, setTo] = useState(initial?.to ?? '');
  const [date, setDate] = useState(initial?.date ?? vnToday());

  useEffect(() => {
    if (initial) {
      setFrom(initial.from);
      setTo(initial.to);
      setDate(initial.date);
    }
  }, [initial?.from, initial?.to, initial?.date]);

  const options = (q: string) =>
    cities.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase())).map((c) => ({ value: c }));

  const go = () => {
    if (!from.trim() || !to.trim()) {
      message.warning('Nhập điểm đi và điểm đến');
      return;
    }
    nav(`/tim-chuyen?${new URLSearchParams({ from: from.trim(), to: to.trim(), date })}`);
  };

  return (
    <div className={`search-bar ${compact ? 'compact' : ''}`}>
      <label className="sb-field">
        <EnvironmentOutlined className="sb-icon" />
        <span className="sb-label">Nơi xuất phát</span>
        <AutoComplete
          id="search-from"
          variant="borderless"
          value={from}
          options={options(from)}
          onChange={setFrom}
          placeholder="Ví dụ: Hồ Chí Minh"
          className="sb-input"
        />
      </label>
      <button
        className="sb-swap"
        type="button"
        aria-label="Đổi chiều"
        onClick={() => {
          setFrom(to);
          setTo(from);
        }}
      >
        <SwapOutlined />
      </button>
      <label className="sb-field">
        <EnvironmentOutlined className="sb-icon" />
        <span className="sb-label">Nơi đến</span>
        <AutoComplete
          id="search-to"
          variant="borderless"
          value={to}
          options={options(to)}
          onChange={setTo}
          placeholder="Ví dụ: Đà Lạt"
          className="sb-input"
        />
      </label>
      <div className="sb-field sb-date">
        <CalendarOutlined className="sb-icon" />
        <span className="sb-label">Ngày đi</span>
        <DatePicker
          id="search-date"
          variant="borderless"
          allowClear={false}
          format="ddd, DD/MM/YYYY"
          value={dayjs(date)}
          disabledDate={(d) => d.format('YYYY-MM-DD') < vnToday()}
          onChange={(d) => d && setDate(d.format('YYYY-MM-DD'))}
          className="sb-input"
        />
        {!compact && (
          <div className="sb-quick">
            <button type="button" className={date === vnToday() ? 'on' : ''} onClick={() => setDate(vnToday())}>
              Hôm nay
            </button>
            <button type="button" className={date === addDays(vnToday(), 1) ? 'on' : ''} onClick={() => setDate(addDays(vnToday(), 1))}>
              Ngày mai
            </button>
          </div>
        )}
      </div>
      <button className="sb-go" type="button" onClick={go}>
        <SearchOutlined /> {compact ? 'Tìm lại' : 'Tìm chuyến xe'}
      </button>
    </div>
  );
}
