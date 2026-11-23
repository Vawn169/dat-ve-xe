import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingChannel, BookingStatus, Gender, PaymentStatus, Prisma, Role, StopType, TripSeatStatus, TripStatus } from '@prisma/client';
import { AuthUser } from '../common/decorators/auth.decorators';
import { AppException, ErrorCode, notFound } from '../common/errors';
import { generateTicketCode, maskPhone } from '../common/ticket-code';
import { CouponsService } from '../coupons/coupons.module';
import { MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeatsGateway } from '../realtime/seats.gateway';
import { canChange, CHANGE_MIN_HOURS, quoteCancel } from './cancel-policy';
import { ChangeTripDto, CounterBookingDto, CreateBookingDto, ListBookingsQuery, PassengerDto, ReviewDto } from './dto/booking.dto';
import { HoldService } from './hold.service';
import { parseTicketCode, qrDataUrl, renderTicketPdf, ticketEmailHtml, vnDate, vnTime, vnd } from './ticket.util';

export const MAX_SEATS_PER_BOOKING = 5;

const BOOKING_INCLUDE = {
  trip: { include: { route: true, bus: true } },
  pickupStop: true,
  dropoffStop: true,
  items: { include: { tripSeat: { include: { seat: true } } }, orderBy: { id: 'asc' } },
  review: true,
  coupon: { select: { code: true } },
} satisfies Prisma.BookingInclude;
type BookingFull = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

class SeatConflictError extends Error {}

interface CreateOpts {
  /** Người giữ ghế (khách online hoặc nhân viên quầy) */
  actorId: number;
  /** Chủ đơn (null khi bán tại quầy) */
  ownerId: number | null;
  channel: BookingChannel;
  soldById?: number;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly holdTtl: number;
  private readonly paymentTtl: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly holds: HoldService,
    private readonly gateway: SeatsGateway,
    private readonly coupons: CouponsService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.holdTtl = Number(config.get('HOLD_TTL_SECONDS') ?? 600);
    this.paymentTtl = Number(config.get('PAYMENT_TTL_SECONDS') ?? 480);
  }

  // ---------------- Sơ đồ ghế & giữ ghế ----------------

  async seatMap(tripId: number, userId?: number) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        route: true,
        bus: { include: { layout: true } },
        tripSeats: { include: { seat: true }, orderBy: { seatId: 'asc' } },
      },
    });
    if (!trip) throw notFound('chuyến');
    const holders = await this.holds.holders(tripId, trip.tripSeats.map((ts) => ts.seatId));

    return {
      trip: {
        id: trip.id,
        departAt: trip.departAt,
        arriveAt: trip.arriveAt,
        basePrice: trip.basePrice,
        status: trip.status,
        originCity: trip.route.originCity,
        destinationCity: trip.route.destinationCity,
        busType: trip.bus.busType,
      },
      layout: { floors: trip.bus.layout.floors, rows: trip.bus.layout.rows, cols: trip.bus.layout.cols },
      holdTtlSeconds: this.holdTtl,
      seats: trip.tripSeats.map((ts, i) => {
        let status: string = ts.status;
        if (ts.status === TripSeatStatus.AVAILABLE && holders[i] !== null) {
          status = holders[i] === userId ? 'HELD_BY_ME' : 'HELD';
        }
        return {
          seatId: ts.seatId,
          code: ts.seat.code,
          floor: ts.seat.floor,
          rowNo: ts.seat.rowNo,
          colNo: ts.seat.colNo,
          price: trip.basePrice + ts.seat.priceExtra,
          femaleOnly: ts.seat.femaleOnly,
          status,
        };
      }),
    };
  }

  async holdSeats(tripId: number, seatIds: number[], userId: number) {
    await this.assertBookableTrip(tripId);
    const tripSeats = await this.prisma.tripSeat.findMany({ where: { tripId } });
    const byId = new Map(tripSeats.map((ts) => [ts.seatId, ts]));
    for (const seatId of seatIds) {
      const ts = byId.get(seatId);
      if (!ts) throw new AppException(ErrorCode.SEAT_NOT_FOUND, 'Ghế không thuộc chuyến này', HttpStatus.NOT_FOUND, { seatId });
      if (ts.status !== TripSeatStatus.AVAILABLE) {
        throw new AppException(ErrorCode.SEAT_TAKEN, ts.status === TripSeatStatus.BLOCKED ? 'Ghế này không mở bán' : 'Ghế đã được bán', HttpStatus.CONFLICT, { seatId });
      }
    }

    // Giới hạn tổng số ghế một người giữ trên một chuyến (chống giữ ghế ảo).
    const allIds = tripSeats.map((ts) => ts.seatId);
    const holders = await this.holds.holders(tripId, allIds);
    const alreadyMine = allIds.filter((id, i) => holders[i] === userId && !seatIds.includes(id)).length;
    if (alreadyMine + seatIds.length > MAX_SEATS_PER_BOOKING) {
      throw new AppException(ErrorCode.TOO_MANY_SEATS, `Mỗi lần chỉ được giữ tối đa ${MAX_SEATS_PER_BOOKING} ghế`);
    }

    await this.holds.holdAll(tripId, seatIds, userId, this.holdTtl);
    this.gateway.emitSeats(tripId, seatIds, 'HELD');
    return { tripId, seatIds, expiresInSeconds: this.holdTtl };
  }

  async releaseSeats(tripId: number, seatIds: number[], userId: number) {
    const released = await this.holds.release(tripId, seatIds, userId);
    this.gateway.emitSeats(tripId, released, 'AVAILABLE');
    return { tripId, releasedSeatIds: released };
  }

  // ---------------- Đặt vé ----------------

  /** Khách đặt online (F07 + F10 + F12) */
  async createBooking(userId: number, dto: CreateBookingDto) {
    const passengers: PassengerDto[] = dto.passengers ?? (dto.passengerNames ?? []).map((name) => ({ name }));
    return this.createInternal({ ...dto, passengers }, { actorId: userId, ownerId: userId, channel: BookingChannel.ONLINE });
  }

  /** Nhân viên bán tại quầy, thu tiền mặt (F23): tạo đơn rồi xác nhận đã thanh toán ngay */
  async counterSale(staffId: number, dto: CounterBookingDto) {
    const view = await this.createInternal(
      { ...dto, contactEmail: dto.contactEmail ?? '' },
      { actorId: staffId, ownerId: null, channel: BookingChannel.COUNTER, soldById: staffId },
    );
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { code: view.code } });
    await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: 'cash',
        txnRef: `${booking.code}-CASH`,
        amount: booking.totalAmount,
        status: PaymentStatus.SUCCESS,
        paidAt: new Date(),
      },
    });
    return this.confirmPaid(booking.id);
  }

  private async createInternal(
    dto: Omit<CreateBookingDto, 'passengerNames'> & { contactEmail: string; passengers?: PassengerDto[]; couponCode?: string },
    opts: CreateOpts,
  ) {
    if (dto.seatIds.length > MAX_SEATS_PER_BOOKING) {
      throw new AppException(ErrorCode.TOO_MANY_SEATS, `Mỗi đơn tối đa ${MAX_SEATS_PER_BOOKING} ghế`);
    }
    const trip = await this.assertBookableTrip(dto.tripId);
    await this.assertStops(trip.routeId, dto.pickupStopId, dto.dropoffStopId);

    const holders = await this.holds.holders(dto.tripId, dto.seatIds);
    const notMine = dto.seatIds.filter((_, i) => holders[i] !== opts.actorId);
    if (notMine.length) {
      throw new AppException(ErrorCode.SEAT_NOT_HELD, 'Hết thời gian giữ ghế hoặc ghế không do bạn giữ, vui lòng chọn lại', HttpStatus.CONFLICT, {
        seatIds: notMine,
      });
    }

    const tripSeats = await this.prisma.tripSeat.findMany({ where: { tripId: dto.tripId, seatId: { in: dto.seatIds } }, include: { seat: true } });
    if (tripSeats.length !== dto.seatIds.length || tripSeats.some((ts) => ts.status !== TripSeatStatus.AVAILABLE)) {
      throw new AppException(ErrorCode.SEAT_TAKEN, 'Có ghế đã được bán, vui lòng chọn lại', HttpStatus.CONFLICT);
    }

    // Ghế dành cho nữ (F10): hành khách ngồi ghế đó phải khai giới tính Nữ
    const order = new Map(dto.seatIds.map((id, i) => [id, i]));
    const passengerOf = (seatId: number) => dto.passengers?.[order.get(seatId) ?? -1];
    const wrong = tripSeats.filter((ts) => ts.seat.femaleOnly && passengerOf(ts.seatId)?.gender !== Gender.FEMALE);
    if (wrong.length) {
      throw new AppException(
        ErrorCode.FEMALE_ONLY_SEAT,
        `Ghế ${wrong.map((w) => w.seat.code).join(', ')} dành cho nữ. Vui lòng chọn giới tính Nữ cho hành khách ngồi ghế này hoặc chọn ghế khác.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Không cho tạo 2 đơn chờ thanh toán cho cùng một ghế (tránh trả tiền 2 lần).
    const pending = await this.prisma.bookingItem.findFirst({
      where: {
        tripSeatId: { in: tripSeats.map((ts) => ts.id) },
        booking: { status: BookingStatus.PENDING_PAYMENT, expiresAt: { gt: new Date() } },
      },
      include: { booking: { select: { code: true } } },
    });
    if (pending) {
      throw new AppException(ErrorCode.CONFLICT, 'Ghế đang nằm trong một đơn chờ thanh toán', HttpStatus.CONFLICT, { bookingCode: pending.booking.code });
    }

    const subtotal = tripSeats.reduce((sum, ts) => sum + trip.basePrice + ts.seat.priceExtra, 0);
    const quote = dto.couponCode ? await this.coupons.quote(dto.couponCode, subtotal) : null;

    // Giữ ghế lâu hơn thời hạn thanh toán để tiền về rồi ghế vẫn còn (khó khăn #13).
    await this.holds.extend(dto.tripId, dto.seatIds, opts.actorId, this.paymentTtl + 120);

    const expiresAt = new Date(Date.now() + this.paymentTtl * 1000);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const booking = await this.prisma.booking.create({
          data: {
            code: generateTicketCode(),
            userId: opts.ownerId,
            soldById: opts.soldById,
            channel: opts.channel,
            tripId: dto.tripId,
            pickupStopId: dto.pickupStopId,
            dropoffStopId: dto.dropoffStopId,
            contactName: dto.contactName,
            contactPhone: dto.contactPhone,
            contactEmail: dto.contactEmail.toLowerCase(),
            couponId: quote?.coupon.id,
            discountAmount: quote?.discount ?? 0,
            totalAmount: subtotal - (quote?.discount ?? 0),
            expiresAt,
            items: {
              create: tripSeats.map((ts) => {
                const p = passengerOf(ts.seatId);
                return {
                  tripSeatId: ts.id,
                  price: trip.basePrice + ts.seat.priceExtra,
                  passengerName: p?.name || dto.contactName,
                  gender: p?.gender,
                  age: p?.age,
                };
              }),
            },
          },
          include: BOOKING_INCLUDE,
        });
        return this.view(booking);
      } catch (e) {
        const isCodeClash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!isCodeClash || attempt === 2) throw e;
      }
    }
    throw new Error('unreachable');
  }

  /**
   * Gọi khi thanh toán thành công. Ghi ghế thành SOLD bằng câu lệnh cập nhật có điều kiện
   * (chỉ ghế còn AVAILABLE) trong transaction; thiếu ghế nào thì hủy cả transaction → NEEDS_REFUND.
   * Thành công thì gửi email vé có mã QR (F14).
   */
  async confirmPaid(bookingId: number) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!booking) throw notFound('đơn đặt vé');
    if (booking.status === BookingStatus.PAID) return this.view(booking);

    const tripSeatIds = booking.items.map((i) => i.tripSeatId);
    const seatIds = booking.items.map((i) => i.tripSeat.seatId);
    let status: BookingStatus;
    try {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.tripSeat.updateMany({
          where: { id: { in: tripSeatIds }, status: TripSeatStatus.AVAILABLE },
          data: { status: TripSeatStatus.SOLD, bookingId: booking.id },
        });
        if (res.count !== tripSeatIds.length) throw new SeatConflictError();
        await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.PAID } });
        if (booking.couponId) await tx.coupon.update({ where: { id: booking.couponId }, data: { usedCount: { increment: 1 } } });
      });
      status = BookingStatus.PAID;
    } catch (e) {
      if (!(e instanceof SeatConflictError)) throw e;
      await this.prisma.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.NEEDS_REFUND } });
      status = BookingStatus.NEEDS_REFUND;
      this.logger.warn(`Đơn ${booking.code} đã thanh toán nhưng ghế không còn → cần hoàn tiền`);
    }

    if (status === BookingStatus.PAID) {
      await this.holds.forceRelease(booking.tripId, seatIds);
      this.gateway.emitSeats(booking.tripId, seatIds, 'SOLD');
      await this.sendTicketEmail({ ...booking, status });
    } else if (booking.userId) {
      const released = await this.holds.release(booking.tripId, seatIds, booking.userId);
      this.gateway.emitSeats(booking.tripId, released, 'AVAILABLE');
    }
    return this.view({ ...booking, status });
  }

  private async sendTicketEmail(b: BookingFull, title = 'Vé điện tử', note = '') {
    if (!b.contactEmail) return;
    await this.mail.send({
      to: b.contactEmail,
      subject: `${title} ${b.code} – ${b.trip.route.originCity} → ${b.trip.route.destinationCity}`,
      html: mailLayout(title, note + ticketEmailHtml(this.ticketData(b))),
      images: [{ cid: 'qr', dataUrl: await qrDataUrl(b.code) }],
    });
  }

  // ---------------- Xem, tra cứu, hủy ----------------

  async listMine(userId: number) {
    const rows = await this.prisma.booking.findMany({ where: { userId }, include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' } });
    return rows.map((b) => this.view(b));
  }

  async getForUser(code: string, user: AuthUser) {
    return this.view(await this.findManaged(code, user));
  }

  /** Tra cứu không cần đăng nhập: phải đúng cả mã vé và số điện thoại. */
  async lookup(code: string, phone: string) {
    const booking = await this.prisma.booking.findUnique({ where: { code: code.trim().toUpperCase() }, include: BOOKING_INCLUDE });
    if (!booking || booking.contactPhone !== phone) throw notFound('vé với mã và số điện thoại này');
    return this.view(booking, true);
  }

  /** Vé PDF (F15): chủ vé, nhân viên/quản trị, hoặc người biết mã + SĐT */
  async ticketPdf(code: string, user?: AuthUser, phone?: string) {
    const b = await this.prisma.booking.findUnique({ where: { code: code.toUpperCase() }, include: BOOKING_INCLUDE });
    const allowed = b && ((user && this.canManage(b, user)) || (phone && b.contactPhone === phone));
    if (!b || !allowed) throw notFound('vé');
    if (b.status !== BookingStatus.PAID) throw new AppException(ErrorCode.CONFLICT, 'Chỉ tải được vé đã thanh toán', HttpStatus.CONFLICT);
    return renderTicketPdf(this.ticketData(b));
  }

  async cancel(code: string, user: AuthUser, fullRefund = false) {
    const booking = await this.findManaged(code, user);
    const seatIds = booking.items.map((i) => i.tripSeat.seatId);
    const isAdmin = user.role === Role.ADMIN || user.role === Role.STAFF;

    if (booking.status === BookingStatus.PENDING_PAYMENT) {
      const updated = await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
        include: BOOKING_INCLUDE,
      });
      if (booking.userId) {
        const released = await this.holds.release(booking.tripId, seatIds, booking.userId);
        this.gateway.emitSeats(booking.tripId, released, 'AVAILABLE');
      }
      return this.view(updated);
    }

    if (booking.status !== BookingStatus.PAID && booking.status !== BookingStatus.NEEDS_REFUND) {
      throw new AppException(ErrorCode.BOOKING_NOT_CANCELLABLE, 'Vé ở trạng thái này không hủy được', HttpStatus.CONFLICT);
    }
    const quote =
      (isAdmin && fullRefund) || booking.status === BookingStatus.NEEDS_REFUND
        ? { allowed: true, feePercent: 0, fee: 0, refund: booking.totalAmount }
        : quoteCancel(booking.totalAmount, booking.trip.departAt);
    if (!quote.allowed) {
      throw new AppException(ErrorCode.BOOKING_NOT_CANCELLABLE, 'Đã quá thời hạn hủy vé theo chính sách', HttpStatus.CONFLICT, quote);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.tripSeat.updateMany({ where: { bookingId: booking.id }, data: { status: TripSeatStatus.AVAILABLE, bookingId: null } });
      await tx.payment.updateMany({ where: { bookingId: booking.id, status: PaymentStatus.SUCCESS }, data: { status: PaymentStatus.REFUNDED } });
      return tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), refundAmount: quote.refund },
        include: BOOKING_INCLUDE,
      });
    });
    this.gateway.emitSeats(booking.tripId, seatIds, 'AVAILABLE');
    if (booking.contactEmail) {
      await this.mail.send({
        to: booking.contactEmail,
        subject: `Đã hủy vé ${booking.code}`,
        html: mailLayout(
          'Xác nhận hủy vé',
          `<p>Vé <b>${booking.code}</b> (${booking.trip.route.originCity} → ${booking.trip.route.destinationCity}, ${vnTime(booking.trip.departAt)} ${vnDate(booking.trip.departAt)}) đã được hủy.</p>
<p>Phí hủy: ${vnd(quote.fee)} (${quote.feePercent}%). Số tiền hoàn: <b>${vnd(quote.refund)}</b>, hoàn về phương thức đã thanh toán.</p>`,
        ),
      });
    }
    // Ghi chú: hoàn tiền thật qua cổng thanh toán chưa làm (chỉ ghi trạng thái REFUNDED)
    return { ...this.view(updated), cancelFee: quote.fee, feePercent: quote.feePercent };
  }

  /**
   * Đổi chuyến / đổi ngày (F19). Quy tắc mẫu: đổi trước giờ chạy ít nhất CHANGE_MIN_HOURS giờ, chỉ sang chuyến
   * cùng tuyến, cùng số ghế, ghế mới phải do khách đang giữ. Ghế mới đắt hơn thì chưa hỗ trợ (cần thanh toán thêm);
   * rẻ hơn thì ghi số tiền chênh lệch được hoàn.
   */
  async changeTrip(code: string, user: AuthUser, dto: ChangeTripDto) {
    const booking = await this.findManaged(code, user);
    if (booking.status !== BookingStatus.PAID) throw new AppException(ErrorCode.NOT_CHANGEABLE, 'Chỉ đổi được vé đã thanh toán', HttpStatus.CONFLICT);
    if (!canChange(booking.trip.departAt)) {
      throw new AppException(ErrorCode.NOT_CHANGEABLE, `Chỉ đổi được vé trước giờ khởi hành ít nhất ${CHANGE_MIN_HOURS} giờ`, HttpStatus.CONFLICT);
    }
    if (dto.tripId === booking.tripId) throw new AppException(ErrorCode.NOT_CHANGEABLE, 'Hãy chọn một chuyến khác');
    const newTrip = await this.assertBookableTrip(dto.tripId);
    if (newTrip.routeId !== booking.trip.routeId) throw new AppException(ErrorCode.NOT_CHANGEABLE, 'Chỉ đổi sang chuyến cùng tuyến');
    if (dto.seatIds.length !== booking.items.length) {
      throw new AppException(ErrorCode.NOT_CHANGEABLE, `Vui lòng chọn đúng ${booking.items.length} ghế ở chuyến mới`);
    }
    const holders = await this.holds.holders(dto.tripId, dto.seatIds);
    if (holders.some((h) => h !== user.id)) {
      throw new AppException(ErrorCode.SEAT_NOT_HELD, 'Hết thời gian giữ ghế ở chuyến mới, vui lòng chọn lại', HttpStatus.CONFLICT);
    }
    const newSeats = await this.prisma.tripSeat.findMany({ where: { tripId: dto.tripId, seatId: { in: dto.seatIds } }, include: { seat: true } });
    const order = new Map(dto.seatIds.map((id, i) => [id, i]));
    newSeats.sort((a, b) => (order.get(a.seatId) ?? 0) - (order.get(b.seatId) ?? 0));
    const oldSubtotal = booking.items.reduce((s, i) => s + i.price, 0);
    const newPrices = newSeats.map((ts) => newTrip.basePrice + ts.seat.priceExtra);
    const newSubtotal = newPrices.reduce((a, b) => a + b, 0);
    if (newSubtotal > oldSubtotal) {
      throw new AppException(ErrorCode.NOT_CHANGEABLE, 'Ghế hoặc chuyến mới đắt hơn vé cũ. Bản hiện tại chỉ hỗ trợ đổi sang chỗ cùng giá hoặc rẻ hơn.');
    }
    const bad = newSeats.filter((ts, i) => ts.seat.femaleOnly && booking.items[i]?.gender !== Gender.FEMALE);
    if (bad.length) throw new AppException(ErrorCode.FEMALE_ONLY_SEAT, `Ghế ${bad.map((b) => b.seat.code).join(', ')} dành cho nữ`);

    const oldTripId = booking.tripId;
    const oldSeatIds = booking.items.map((i) => i.tripSeat.seatId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.tripSeat.updateMany({
          where: { id: { in: newSeats.map((s) => s.id) }, status: TripSeatStatus.AVAILABLE },
          data: { status: TripSeatStatus.SOLD, bookingId: booking.id },
        });
        if (res.count !== newSeats.length) throw new SeatConflictError();
        await tx.tripSeat.updateMany({ where: { tripId: oldTripId, bookingId: booking.id }, data: { status: TripSeatStatus.AVAILABLE, bookingId: null } });
        await tx.bookingItem.deleteMany({ where: { bookingId: booking.id } });
        await tx.bookingItem.createMany({
          data: newSeats.map((ts, i) => ({
            bookingId: booking.id,
            tripSeatId: ts.id,
            price: newPrices[i],
            passengerName: booking.items[i]?.passengerName,
            gender: booking.items[i]?.gender,
            age: booking.items[i]?.age,
          })),
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            tripId: dto.tripId,
            changedFromTripId: oldTripId,
            reminderSentAt: null,
            refundAmount: oldSubtotal > newSubtotal ? (booking.refundAmount ?? 0) + oldSubtotal - newSubtotal : booking.refundAmount,
          },
        });
      });
    } catch (e) {
      if (e instanceof SeatConflictError) throw new AppException(ErrorCode.SEAT_TAKEN, 'Có ghế ở chuyến mới vừa được bán', HttpStatus.CONFLICT);
      throw e;
    }
    await this.holds.forceRelease(dto.tripId, dto.seatIds);
    this.gateway.emitSeats(dto.tripId, dto.seatIds, 'SOLD');
    this.gateway.emitSeats(oldTripId, oldSeatIds, 'AVAILABLE');
    const updated = await this.prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: BOOKING_INCLUDE });
    await this.sendTicketEmail(updated, 'Đổi vé thành công', '<p><b>Vé của bạn đã được đổi sang chuyến mới.</b> Mã vé giữ nguyên.</p>');
    return this.view(updated);
  }

  /** Đánh giá chuyến đi (F20): chỉ vé đã thanh toán, chuyến đã đến nơi, mỗi vé 1 lần */
  async review(code: string, user: AuthUser, dto: ReviewDto) {
    const b = await this.prisma.booking.findUnique({ where: { code }, include: { trip: true, review: true } });
    if (!b || b.userId !== user.id) throw notFound('vé');
    if (b.status !== BookingStatus.PAID || b.trip.arriveAt > new Date()) {
      throw new AppException(ErrorCode.REVIEW_NOT_ALLOWED, 'Chỉ đánh giá được sau khi chuyến đi kết thúc', HttpStatus.CONFLICT);
    }
    if (b.review) throw new AppException(ErrorCode.REVIEW_NOT_ALLOWED, 'Bạn đã đánh giá chuyến này rồi', HttpStatus.CONFLICT);
    return this.prisma.review.create({ data: { bookingId: b.id, tripId: b.tripId, userId: user.id, rating: dto.rating, comment: dto.comment } });
  }

  // ---------------- Nhân viên: danh sách hành khách, check-in (F24) ----------------

  async manifest(tripId: number) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { route: true, bus: true } });
    if (!trip) throw notFound('chuyến');
    const items = await this.prisma.bookingItem.findMany({
      where: { booking: { tripId, status: BookingStatus.PAID } },
      include: { tripSeat: { include: { seat: true } }, booking: { include: { pickupStop: true, dropoffStop: true } } },
      orderBy: { tripSeat: { seat: { code: 'asc' } } },
    });
    return {
      trip: { id: trip.id, departAt: trip.departAt, originCity: trip.route.originCity, destinationCity: trip.route.destinationCity, busType: trip.bus.busType, plateNumber: trip.bus.plateNumber },
      total: items.length,
      checkedIn: items.filter((i) => i.checkedInAt).length,
      passengers: items.map((i) => ({
        itemId: i.id,
        code: i.booking.code,
        seat: i.tripSeat.seat.code,
        name: i.passengerName,
        gender: i.gender,
        phone: i.booking.contactPhone,
        channel: i.booking.channel,
        pickup: i.booking.pickupStop.name,
        dropoff: i.booking.dropoffStop.name,
        checkedInAt: i.checkedInAt,
      })),
    };
  }

  async checkin(raw: string) {
    const code = parseTicketCode(raw);
    const b = await this.prisma.booking.findUnique({ where: { code }, include: BOOKING_INCLUDE });
    if (!b) throw notFound(`vé ${code}`);
    if (b.status !== BookingStatus.PAID) throw new AppException(ErrorCode.CONFLICT, `Vé ${code} không ở trạng thái đã thanh toán`, HttpStatus.CONFLICT);
    const already = b.items.every((i) => i.checkedInAt);
    if (!already) await this.prisma.bookingItem.updateMany({ where: { bookingId: b.id, checkedInAt: null }, data: { checkedInAt: new Date() } });
    return { alreadyCheckedIn: already, ticket: this.view(await this.prisma.booking.findUniqueOrThrow({ where: { id: b.id }, include: BOOKING_INCLUDE })) };
  }

  // ---------------- Quản trị ----------------

  async adminList(q: ListBookingsQuery) {
    const s = q.q?.trim();
    const rows = await this.prisma.booking.findMany({
      where: {
        status: q.status,
        tripId: q.tripId,
        OR: s
          ? [{ code: { contains: s.toUpperCase() } }, { contactPhone: { contains: s } }, { contactName: { contains: s, mode: 'insensitive' } }]
          : undefined,
      },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((b) => this.view(b));
  }

  /** Khóa / mở ghế không bán trên một chuyến (F26) */
  async blockSeat(tripId: number, seatId: number, blocked: boolean) {
    const ts = await this.prisma.tripSeat.findUnique({ where: { tripId_seatId: { tripId, seatId } } });
    if (!ts) throw notFound('ghế của chuyến');
    if (ts.status === TripSeatStatus.SOLD) throw new AppException(ErrorCode.CONFLICT, 'Ghế đã bán, không khóa được', HttpStatus.CONFLICT);
    const status = blocked ? TripSeatStatus.BLOCKED : TripSeatStatus.AVAILABLE;
    await this.prisma.tripSeat.update({ where: { id: ts.id }, data: { status } });
    if (blocked) await this.holds.forceRelease(tripId, [seatId]);
    this.gateway.emitSeats(tripId, [seatId], blocked ? 'SOLD' : 'AVAILABLE');
    return { tripId, seatId, status };
  }

  /** Hủy chuyến (F27): hủy mọi vé, hoàn 100%, gửi email báo khách (khó khăn #6) */
  async cancelTrip(tripId: number) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { route: true } });
    if (!trip) throw notFound('chuyến');
    if (trip.status !== TripStatus.SCHEDULED) throw new AppException(ErrorCode.CONFLICT, 'Chuyến không ở trạng thái có thể hủy', HttpStatus.CONFLICT);
    const bookings = await this.prisma.booking.findMany({
      where: { tripId, status: { in: [BookingStatus.PAID, BookingStatus.PENDING_PAYMENT] } },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({ where: { id: tripId }, data: { status: TripStatus.CANCELLED } });
      for (const b of bookings) {
        await tx.booking.update({
          where: { id: b.id },
          data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), refundAmount: b.status === BookingStatus.PAID ? b.totalAmount : null },
        });
        await tx.payment.updateMany({ where: { bookingId: b.id, status: PaymentStatus.SUCCESS }, data: { status: PaymentStatus.REFUNDED } });
      }
      await tx.tripSeat.updateMany({ where: { tripId, status: TripSeatStatus.SOLD }, data: { status: TripSeatStatus.AVAILABLE, bookingId: null } });
    });
    let emailed = 0;
    for (const b of bookings) {
      if (!b.contactEmail) continue;
      await this.mail.send({
        to: b.contactEmail,
        subject: `Chuyến xe của bạn đã bị hủy – vé ${b.code}`,
        html: mailLayout(
          'Thông báo hủy chuyến',
          `<p>Xin lỗi ${b.contactName}, chuyến <b>${trip.route.originCity} → ${trip.route.destinationCity}</b> lúc <b>${vnTime(trip.departAt)} ${vnDate(trip.departAt)}</b> đã bị nhà xe hủy.</p>
<p>Vé <b>${b.code}</b> được hoàn <b>${b.status === BookingStatus.PAID ? vnd(b.totalAmount) : '0đ (chưa thanh toán)'}</b> về phương thức đã thanh toán. Bạn có thể đặt chuyến khác trên website.</p>`,
        ),
      });
      emailed++;
    }
    return { tripId, cancelledBookings: bookings.length, emailed };
  }

  /** Dùng cho module thanh toán: lấy đơn của chính người dùng để tạo thanh toán. */
  async getPayable(code: string, userId: number) {
    const booking = await this.prisma.booking.findUnique({ where: { code } });
    if (!booking || booking.userId !== userId) throw notFound('vé');
    if (booking.status !== BookingStatus.PENDING_PAYMENT || booking.expiresAt <= new Date()) {
      throw new AppException(ErrorCode.BOOKING_NOT_PAYABLE, 'Đơn không còn ở trạng thái chờ thanh toán hoặc đã hết hạn', HttpStatus.CONFLICT);
    }
    return booking;
  }

  // ---------------- Tác vụ tự động ----------------

  /** F33: mỗi phút gửi email nhắc khách có chuyến khởi hành trong 3 giờ tới */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendReminders() {
    const now = new Date();
    const due = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PAID,
        reminderSentAt: null,
        contactEmail: { not: '' },
        trip: { status: TripStatus.SCHEDULED, departAt: { gt: now, lte: new Date(now.getTime() + 3 * 3_600_000) } },
      },
      include: BOOKING_INCLUDE,
      take: 100,
    });
    for (const b of due) {
      await this.mail.send({
        to: b.contactEmail,
        subject: `Nhắc lịch: ${vnTime(b.trip.departAt)} hôm nay xe chạy – vé ${b.code}`,
        html: mailLayout(
          'Nhắc lịch khởi hành',
          `<p>Xin chào ${b.contactName}, chuyến <b>${b.trip.route.originCity} → ${b.trip.route.destinationCity}</b> của bạn khởi hành lúc <b>${vnTime(b.trip.departAt)}</b>.</p>
<p>Điểm đón: <b>${b.pickupStop.name}</b> – ${b.pickupStop.address}. Vui lòng có mặt trước 30 phút và mang theo mã vé <b>${b.code}</b>.</p>`,
        ),
      });
      await this.prisma.booking.update({ where: { id: b.id }, data: { reminderSentAt: new Date() } });
    }
    return due.length;
  }

  /** Đơn chờ thanh toán quá hạn → EXPIRED (ghế giữ trong Redis tự hết hạn) */
  @Cron(CronExpression.EVERY_MINUTE)
  async expirePending() {
    const r = await this.prisma.booking.updateMany({
      where: { status: BookingStatus.PENDING_PAYMENT, expiresAt: { lt: new Date() } },
      data: { status: BookingStatus.EXPIRED },
    });
    return r.count;
  }

  // ---------------- Hàm phụ ----------------

  private async findManaged(code: string, user: AuthUser) {
    const booking = await this.prisma.booking.findUnique({ where: { code }, include: BOOKING_INCLUDE });
    if (!booking || !this.canManage(booking, user)) throw notFound('vé'); // không tiết lộ vé của người khác có tồn tại
    return booking;
  }

  private async assertBookableTrip(tripId: number) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw notFound('chuyến');
    if (trip.status !== TripStatus.SCHEDULED || trip.departAt <= new Date()) {
      throw new AppException(ErrorCode.TRIP_NOT_BOOKABLE, 'Chuyến đã khởi hành hoặc đã bị hủy', HttpStatus.CONFLICT);
    }
    return trip;
  }

  private async assertStops(routeId: number, pickupId: number, dropoffId: number) {
    const stops = await this.prisma.stop.findMany({ where: { routeId, id: { in: [pickupId, dropoffId] } } });
    const pickup = stops.find((s) => s.id === pickupId);
    const dropoff = stops.find((s) => s.id === dropoffId);
    const ok = pickup && dropoff && pickup.type !== StopType.DROPOFF && dropoff.type !== StopType.PICKUP && pickup.orderNo < dropoff.orderNo;
    if (!ok) throw new AppException(ErrorCode.INVALID_STOP, 'Điểm đón hoặc điểm trả không hợp lệ cho tuyến này');
  }

  private canManage(booking: { userId: number | null }, user: AuthUser) {
    return booking.userId === user.id || user.role === Role.ADMIN || user.role === Role.STAFF;
  }

  private ticketData(b: BookingFull) {
    return {
      code: b.code,
      status: b.status,
      totalAmount: b.totalAmount,
      discountAmount: b.discountAmount,
      contactName: b.contactName,
      contactPhone: b.contactPhone,
      trip: {
        departAt: b.trip.departAt,
        arriveAt: b.trip.arriveAt,
        originCity: b.trip.route.originCity,
        destinationCity: b.trip.route.destinationCity,
        busType: b.trip.bus.busType,
        plateNumber: b.trip.bus.plateNumber,
      },
      pickupStop: b.pickupStop,
      dropoffStop: b.dropoffStop,
      seats: b.items.map((i) => ({ code: i.tripSeat.seat.code, passengerName: i.passengerName, price: i.price })),
    };
  }

  private view(b: BookingFull, publicView = false) {
    const expired = b.status === BookingStatus.PENDING_PAYMENT && b.expiresAt <= new Date();
    const now = new Date();
    return {
      code: b.code,
      status: expired ? BookingStatus.EXPIRED : b.status,
      channel: b.channel,
      subtotal: b.totalAmount + b.discountAmount,
      discountAmount: b.discountAmount,
      couponCode: b.coupon?.code ?? null,
      totalAmount: b.totalAmount,
      refundAmount: b.refundAmount,
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
      changedFromTripId: b.changedFromTripId,
      contactName: b.contactName,
      contactPhone: publicView ? maskPhone(b.contactPhone) : b.contactPhone,
      contactEmail: publicView ? undefined : b.contactEmail,
      canChange: b.status === BookingStatus.PAID && canChange(b.trip.departAt, now),
      canReview: !publicView && b.status === BookingStatus.PAID && b.trip.arriveAt <= now && !b.review,
      review: b.review ? { rating: b.review.rating, comment: b.review.comment } : null,
      trip: {
        id: b.trip.id,
        routeId: b.trip.routeId,
        departAt: b.trip.departAt,
        arriveAt: b.trip.arriveAt,
        originCity: b.trip.route.originCity,
        destinationCity: b.trip.route.destinationCity,
        busType: b.trip.bus.busType,
        plateNumber: b.trip.bus.plateNumber,
        status: b.trip.status,
      },
      pickupStop: { id: b.pickupStop.id, name: b.pickupStop.name, address: b.pickupStop.address, lat: b.pickupStop.lat, lng: b.pickupStop.lng },
      dropoffStop: { id: b.dropoffStop.id, name: b.dropoffStop.name, address: b.dropoffStop.address, lat: b.dropoffStop.lat, lng: b.dropoffStop.lng },
      seats: b.items.map((i) => ({
        seatId: i.tripSeat.seatId,
        code: i.tripSeat.seat.code,
        passengerName: i.passengerName,
        gender: i.gender,
        age: i.age,
        price: i.price,
        checkedIn: !!i.checkedInAt,
      })),
    };
  }
}
