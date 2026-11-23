import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException, ErrorCode } from '../common/errors';
import { RedisService } from '../redis/redis.service';

// Chỉ xóa / gia hạn khóa khi khóa đang thuộc đúng người (so sánh và thao tác trong 1 lệnh nguyên tử).
const DEL_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
const EXPIRE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end`;

/** Sau khi giữ một ghế quá tổng thời gian cho phép, phải chờ bấy nhiêu giây mới giữ lại được ghế đó. */
const COOLDOWN_SECONDS = 15 * 60;
/** Số lần bấm giữ ghế tối đa của một người trong 1 giờ (chống bot giữ ghế ảo). */
const MAX_HOLDS_PER_HOUR = 60;

/**
 * Giữ ghế tạm thời bằng Redis: key hold:{tripId}:{seatId} = userId, tự hết hạn sau ttl giây.
 * SET ... NX đảm bảo khi nhiều người bấm cùng một ghế, chỉ đúng 1 người giữ được.
 *
 * Chống "giữ ghế vô hạn" (bài học từ lỗi của redBus năm 2023 – xem báo cáo tìm hiểu):
 *  - holdstart:{tripId}:{seatId} ghi lại người và thời điểm bắt đầu giữ;
 *  - tổng thời gian một người giữ một ghế không vượt quá maxTotal (giữ + thanh toán);
 *  - quá giới hạn thì phải chờ COOLDOWN_SECONDS mới giữ lại được chính ghế đó;
 *  - mỗi người tối đa MAX_HOLDS_PER_HOUR lần bấm giữ mỗi giờ.
 */
@Injectable()
export class HoldService {
  private readonly maxTotal: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    const hold = Number(config.get('HOLD_TTL_SECONDS') ?? 600);
    const pay = Number(config.get('PAYMENT_TTL_SECONDS') ?? 480);
    this.maxTotal = hold + pay + 120;
  }

  private key(tripId: number, seatId: number) {
    return `hold:${tripId}:${seatId}`;
  }

  private startKey(tripId: number, seatId: number) {
    return `holdstart:${tripId}:${seatId}`;
  }

  /** Trả về id người đang giữ từng ghế (null nếu không ai giữ), theo đúng thứ tự seatIds. */
  async holders(tripId: number, seatIds: number[]): Promise<(number | null)[]> {
    if (!seatIds.length) return [];
    const values = await this.redis.client.mget(seatIds.map((id) => this.key(tripId, id)));
    return values.map((v) => (v === null ? null : Number(v)));
  }

  async ttl(tripId: number, seatId: number): Promise<number> {
    return this.redis.client.ttl(this.key(tripId, seatId));
  }

  /** Giây đã giữ (tính từ lần đầu) nếu chính người này đang có mốc bắt đầu, ngược lại null. */
  private async heldFor(tripId: number, seatId: number, userId: number): Promise<number | null> {
    const v = await this.redis.client.get(this.startKey(tripId, seatId));
    if (!v) return null;
    const [uid, ts] = v.split(':');
    if (Number(uid) !== userId) return null;
    return (Date.now() - Number(ts)) / 1000;
  }

  private async countHold(userId: number) {
    const k = `holdcount:${userId}:${Math.floor(Date.now() / 3_600_000)}`;
    const n = await this.redis.client.incr(k);
    if (n === 1) await this.redis.client.expire(k, 3600);
    if (n > MAX_HOLDS_PER_HOUR) {
      throw new AppException(ErrorCode.HOLD_LIMIT, 'Bạn thao tác giữ ghế quá nhiều lần, vui lòng thử lại sau', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /**
   * Giữ tất cả ghế hoặc không giữ ghế nào. Ghế người này đã giữ trước đó thì được gia hạn
   * (trong giới hạn tổng thời gian). Ghế đã có người khác giữ → trả lại các ghế vừa giữ và báo SEAT_TAKEN.
   */
  async holdAll(tripId: number, seatIds: number[], userId: number, ttlSeconds: number): Promise<void> {
    await this.countHold(userId);
    const acquired: number[] = [];
    const fail = async (e: AppException) => {
      await this.release(tripId, acquired, userId);
      throw e;
    };
    for (const seatId of seatIds) {
      const key = this.key(tripId, seatId);
      const held = await this.heldFor(tripId, seatId, userId);
      if (held !== null && held > this.maxTotal) {
        const wait = Math.ceil((this.maxTotal + COOLDOWN_SECONDS - held) / 60);
        await fail(
          new AppException(ErrorCode.HOLD_LIMIT, `Bạn đã giữ ghế này quá lâu, vui lòng chọn ghế khác hoặc thử lại sau khoảng ${wait} phút`, HttpStatus.CONFLICT, { seatId }),
        );
      }
      const ok = await this.redis.client.set(key, String(userId), 'EX', ttlSeconds, 'NX');
      if (ok === 'OK') {
        acquired.push(seatId);
        if (held === null) {
          await this.redis.client.set(this.startKey(tripId, seatId), `${userId}:${Date.now()}`, 'EX', this.maxTotal + COOLDOWN_SECONDS);
        }
        continue;
      }
      const refreshed = await this.redis.client.eval(EXPIRE_IF_OWNER, 1, key, String(userId), String(ttlSeconds));
      if (refreshed === 1) continue;
      await fail(new AppException(ErrorCode.SEAT_TAKEN, 'Ghế vừa có người khác chọn, vui lòng chọn ghế khác', HttpStatus.CONFLICT, { seatId }));
    }
  }

  /** Gia hạn các ghế người này đang giữ (không vượt tổng thời gian cho phép). Trả về số ghế gia hạn được. */
  async extend(tripId: number, seatIds: number[], userId: number, ttlSeconds: number): Promise<number> {
    let n = 0;
    for (const seatId of seatIds) {
      const held = (await this.heldFor(tripId, seatId, userId)) ?? 0;
      const ttl = Math.max(1, Math.min(ttlSeconds, Math.floor(this.maxTotal - held)));
      n += Number(await this.redis.client.eval(EXPIRE_IF_OWNER, 1, this.key(tripId, seatId), String(userId), String(ttl)));
    }
    return n;
  }

  /** Bỏ giữ các ghế của chính người này. Trả về danh sách ghế đã bỏ giữ. */
  async release(tripId: number, seatIds: number[], userId: number): Promise<number[]> {
    const released: number[] = [];
    for (const seatId of seatIds) {
      const n = await this.redis.client.eval(DEL_IF_OWNER, 1, this.key(tripId, seatId), String(userId));
      if (n === 1) released.push(seatId);
    }
    return released;
  }

  /** Xóa khóa giữ bất kể ai giữ (dùng sau khi ghế đã bán hoặc khi hệ thống hủy đơn). */
  async forceRelease(tripId: number, seatIds: number[]): Promise<void> {
    if (!seatIds.length) return;
    await this.redis.client.del(...seatIds.flatMap((id) => [this.key(tripId, id), this.startKey(tripId, id)]));
  }
}
