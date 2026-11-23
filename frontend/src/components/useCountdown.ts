import { useEffect, useState } from 'react';

/** Số giây còn lại tới thời điểm `until` (ms). null nếu không có hạn. */
export function useCountdown(until: number | null): number | null {
  const [left, setLeft] = useState<number | null>(until ? Math.max(0, Math.round((until - Date.now()) / 1000)) : null);
  useEffect(() => {
    if (!until) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.round((until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
