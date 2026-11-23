import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, TripSeatStatus, TripStatus } from '@prisma/client';
import { AppException, ErrorCode, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBusDto,
  CreateRouteDto,
  CreateSeatLayoutDto,
  CreateTripDto,
  ScheduleDto,
  SearchTripsDto,
  UpdateBusDto,
  UpdateRouteDto,
  UpdateSeatDto,
} from './dto/catalog.dto';
import { generateSeats, vnDayRange } from './seat-layout.util';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mô hình 1 nhà xe: nếu không truyền operatorId thì dùng nhà xe đầu tiên. */
  private async operatorId(given?: number): Promise<number> {
    if (given) return given;
    const op = await this.prisma.operator.findFirst({ orderBy: { id: 'asc' } });
    if (!op) throw notFound('nhà xe (hãy chạy seed hoặc tạo nhà xe trước)');
    return op.id;
  }

  // ---------- Tuyến ----------

  listRoutes(includeInactive = false) {
    return this.prisma.route.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { stops: { orderBy: { orderNo: 'asc' } } },
      orderBy: { id: 'asc' },
    });
  }

  async getRoute(id: number) {
    const route = await this.prisma.route.findUnique({ where: { id }, include: { stops: { orderBy: { orderNo: 'asc' } } } });
    if (!route) throw notFound('tuyến');
    return route;
  }

  async createRoute(dto: CreateRouteDto) {
    const { stops, operatorId, ...data } = dto;
    return this.prisma.route.create({
      data: { ...data, operatorId: await this.operatorId(operatorId), stops: { create: stops } },
      include: { stops: { orderBy: { orderNo: 'asc' } } },
    });
  }

  /** Sửa tuyến. Nếu gửi danh sách điểm dừng thì cập nhật theo thứ tự (điểm đã có đơn đặt không xóa được). */
  async updateRoute(id: number, dto: UpdateRouteDto) {
    await this.getRoute(id);
    const { stops, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      await tx.route.update({ where: { id }, data });
      if (stops) {
        const existing = await tx.stop.findMany({ where: { routeId: id } });
        const byOrder = new Map(existing.map((s) => [s.orderNo, s]));
        for (const s of stops) {
          const old = byOrder.get(s.orderNo);
          if (old) await tx.stop.update({ where: { id: old.id }, data: s });
          else await tx.stop.create({ data: { ...s, routeId: id } });
          byOrder.delete(s.orderNo);
        }
        for (const s of byOrder.values()) await tx.stop.delete({ where: { id: s.id } });
      }
      return tx.route.findUnique({ where: { id }, include: { stops: { orderBy: { orderNo: 'asc' } } } });
    });
  }

  async deleteRoute(id: number) {
    await this.getRoute(id);
    // Tuyến đã có chuyến thì không xóa được (khóa ngoại) → nên dùng isActive = false.
    await this.prisma.route.delete({ where: { id } });
    return { id };
  }

  // ---------- Sơ đồ ghế & xe ----------

  listSeatLayouts() {
    return this.prisma.seatLayout.findMany({
      include: { seats: { orderBy: [{ floor: 'asc' }, { rowNo: 'asc' }, { colNo: 'asc' }] } },
      orderBy: { id: 'asc' },
    });
  }

  createSeatLayout(dto: CreateSeatLayoutDto) {
    return this.prisma.seatLayout.create({
      data: { ...dto, seats: { create: generateSeats(dto.floors, dto.rows, dto.cols) } },
      include: { seats: true },
    });
  }

  async updateSeat(id: number, dto: UpdateSeatDto) {
    if (!(await this.prisma.seat.findUnique({ where: { id } }))) throw notFound('ghế');
    return this.prisma.seat.update({ where: { id }, data: dto });
  }

  listBuses() {
    return this.prisma.bus.findMany({ include: { layout: true }, orderBy: { id: 'asc' } });
  }

  async createBus(dto: CreateBusDto) {
    const { operatorId, ...data } = dto;
    return this.prisma.bus.create({ data: { ...data, operatorId: await this.operatorId(operatorId) } });
  }

  async updateBus(id: number, dto: UpdateBusDto) {
    if (!(await this.prisma.bus.findUnique({ where: { id } }))) throw notFound('xe');
    return this.prisma.bus.update({ where: { id }, data: dto });
  }

  // ---------- Chuyến ----------

  async createTrip(dto: CreateTripDto) {
    const departAt = new Date(dto.departAt);
    const arriveAt = new Date(dto.arriveAt);
    if (arriveAt <= departAt) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Giờ đến phải sau giờ khởi hành');
    const bus = await this.prisma.bus.findUnique({ where: { id: dto.busId }, include: { layout: { include: { seats: true } } } });
    if (!bus) throw notFound('xe');
    await this.getRoute(dto.routeId);
    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({ data: { routeId: dto.routeId, busId: dto.busId, departAt, arriveAt, basePrice: dto.basePrice } });
      await tx.tripSeat.createMany({ data: bus.layout.seats.map((s) => ({ tripId: trip.id, seatId: s.id })) });
      return trip;
    });
  }

  /** Điểm đánh giá trung bình theo tuyến (F20) */
  private async ratingsByRoute(): Promise<Map<number, { avg: number; count: number }>> {
    const rows = await this.prisma.$queryRaw<{ route_id: number; avg: number; count: bigint }[]>(Prisma.sql`
      SELECT t.route_id, AVG(r.rating)::float AS avg, COUNT(*) AS count
      FROM reviews r JOIN trips t ON t.id = r.trip_id GROUP BY t.route_id`);
    return new Map(rows.map((r) => [r.route_id, { avg: Math.round(r.avg * 10) / 10, count: Number(r.count) }]));
  }

  /**
   * Tìm chuyến theo điểm đi/đến (không phân biệt hoa thường) và ngày theo giờ Việt Nam, có lọc và sắp xếp (F05, F06).
   * availableSeats chỉ trừ ghế đã bán/khóa, chưa trừ ghế đang được giữ tạm trong Redis.
   */
  async searchTrips(q: SearchTripsDto) {
    const { start, end } = vnDayRange(q.date);
    const now = new Date();
    const trips = await this.prisma.trip.findMany({
      where: {
        status: TripStatus.SCHEDULED,
        departAt: { gte: start > now ? start : now, lt: end },
        basePrice: { gte: q.priceMin, lte: q.priceMax },
        bus: q.busType ? { busType: q.busType } : undefined,
        route: {
          isActive: true,
          originCity: { contains: q.from.trim(), mode: 'insensitive' },
          destinationCity: { contains: q.to.trim(), mode: 'insensitive' },
        },
      },
      include: {
        route: {
          select: {
            originCity: true,
            destinationCity: true,
            operator: { select: { id: true, name: true, logoUrl: true } },
            stops: { select: { id: true, name: true, type: true, offsetMinutes: true }, orderBy: { orderNo: 'asc' } },
          },
        },
        bus: { select: { busType: true, amenities: true, photos: true } },
        _count: { select: { tripSeats: { where: { status: TripSeatStatus.AVAILABLE } } } },
      },
      orderBy: { departAt: 'asc' },
    });
    const ratings = await this.ratingsByRoute();
    // Tổng số ghế theo sơ đồ của từng xe (để hiện "còn x/y chỗ")
    const busIds = [...new Set(trips.map((t) => t.busId))];
    const buses = await this.prisma.bus.findMany({ where: { id: { in: busIds } }, select: { id: true, layout: { select: { _count: { select: { seats: true } } } } } });
    const seatTotals = new Map(buses.map((b) => [b.id, b.layout._count.seats]));

    const list = trips
      .filter((t) => {
        const hour = (t.departAt.getUTCHours() + 7) % 24; // Việt Nam UTC+7, không đổi giờ theo mùa
        return (q.hourFrom === undefined || hour >= q.hourFrom) && (q.hourTo === undefined || hour <= q.hourTo);
      })
      .map((t) => {
        const r = ratings.get(t.routeId);
        const stop = (s: { id: number; name: string; offsetMinutes: number }) => ({ id: s.id, name: s.name, offsetMinutes: s.offsetMinutes });
        return {
          id: t.id,
          departAt: t.departAt,
          arriveAt: t.arriveAt,
          basePrice: t.basePrice,
          busType: t.bus.busType,
          amenities: t.bus.amenities,
          operatorName: t.route.operator.name,
          operatorId: t.route.operator.id,
          routeId: t.routeId,
          operatorLogo: t.route.operator.logoUrl,
          photos: t.bus.photos,
          totalSeats: seatTotals.get(t.busId) ?? t._count.tripSeats,
          pickups: t.route.stops.filter((s) => s.type !== 'DROPOFF').map(stop),
          dropoffs: t.route.stops.filter((s) => s.type !== 'PICKUP').map(stop),
          originCity: t.route.originCity,
          destinationCity: t.route.destinationCity,
          availableSeats: t._count.tripSeats,
          rating: r?.avg ?? null,
          ratingCount: r?.count ?? 0,
        };
      })
      .filter((t) => q.minRating === undefined || (t.rating ?? 0) >= q.minRating);

    const sorters: Record<string, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      price: (a, b) => a.basePrice - b.basePrice,
      seats: (a, b) => b.availableSeats - a.availableSeats,
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    };
    return q.sort && sorters[q.sort] ? list.sort(sorters[q.sort]) : list;
  }

  /** Chi tiết chuyến: lộ trình, điểm dừng có tọa độ, tiện ích xe, chính sách (F07) */
  async getTrip(id: number) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        route: { include: { stops: { orderBy: { orderNo: 'asc' } }, operator: { select: { name: true, hotline: true, logoUrl: true } } } },
        bus: { select: { busType: true, plateNumber: true, amenities: true, photos: true } },
      },
    });
    if (!trip) throw notFound('chuyến');
    return trip;
  }

  /** Đánh giá gần đây của tuyến (F20) */
  async tripReviews(tripId: number) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw notFound('chuyến');
    const [reviews, agg] = await Promise.all([
      this.prisma.review.findMany({
        where: { trip: { routeId: trip.routeId } },
        include: { user: { select: { fullName: true } }, trip: { select: { departAt: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.review.aggregate({ where: { trip: { routeId: trip.routeId } }, _avg: { rating: true }, _count: true }),
    ]);
    return {
      average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
      count: agg._count,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        tripDate: r.trip.departAt,
        // Che bớt tên người đánh giá
        author: r.user.fullName.split(' ').slice(-1)[0] + ' ***',
      })),
    };
  }

  adminTrips(date?: string) {
    const range = date ? vnDayRange(date) : null;
    return this.prisma.trip.findMany({
      where: range ? { departAt: { gte: range.start, lt: range.end } } : { departAt: { gte: new Date(Date.now() - 86_400_000) } },
      include: {
        route: { select: { originCity: true, destinationCity: true } },
        bus: { select: { busType: true, plateNumber: true } },
        _count: { select: { tripSeats: true } },
        tripSeats: { select: { status: true } },
      },
      orderBy: { departAt: 'asc' },
      take: 300,
    }).then((rows) =>
      rows.map(({ tripSeats, ...t }) => ({
        ...t,
        soldSeats: tripSeats.filter((s) => s.status === TripSeatStatus.SOLD).length,
        blockedSeats: tripSeats.filter((s) => s.status === TripSeatStatus.BLOCKED).length,
      })),
    );
  }

  // ---------- Lịch chạy lặp + tạo chuyến hàng loạt (F27) ----------

  listSchedules() {
    return this.prisma.tripSchedule.findMany({
      include: { route: { select: { originCity: true, destinationCity: true } }, bus: { select: { busType: true, plateNumber: true } } },
      orderBy: [{ routeId: 'asc' }, { departTime: 'asc' }],
    });
  }

  async createSchedule(dto: ScheduleDto) {
    await this.getRoute(dto.routeId);
    if (!(await this.prisma.bus.findUnique({ where: { id: dto.busId } }))) throw notFound('xe');
    return this.prisma.tripSchedule.create({ data: dto });
  }

  async updateSchedule(id: number, dto: Partial<ScheduleDto>) {
    if (!(await this.prisma.tripSchedule.findUnique({ where: { id } }))) throw notFound('lịch chạy');
    return this.prisma.tripSchedule.update({ where: { id }, data: dto });
  }

  /**
   * Tạo chuyến cho `days` ngày tới từ các lịch đang bật. Chuyến đã tạo rồi thì bỏ qua
   * (UNIQUE(schedule_id, depart_at)), nên bấm nhiều lần cũng không bị trùng.
   */
  async generateTrips(days: number, scheduleId?: number) {
    const schedules = await this.prisma.tripSchedule.findMany({
      where: { isActive: true, id: scheduleId },
      include: { bus: { include: { layout: { include: { seats: true } } } } },
    });
    const todayVN = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    let created = 0;
    let skipped = 0;
    for (const s of schedules) {
      for (let d = 0; d < days; d++) {
        const { start } = vnDayRange(todayVN);
        const [hh, mm] = s.departTime.split(':').map(Number);
        const departAt = new Date(start.getTime() + d * 86_400_000 + (hh * 60 + mm) * 60_000);
        if (departAt <= new Date()) continue;
        const exists = await this.prisma.trip.findUnique({ where: { scheduleId_departAt: { scheduleId: s.id, departAt } } });
        if (exists) {
          skipped++;
          continue;
        }
        await this.prisma.$transaction(async (tx) => {
          const trip = await tx.trip.create({
            data: {
              routeId: s.routeId,
              busId: s.busId,
              scheduleId: s.id,
              departAt,
              arriveAt: new Date(departAt.getTime() + s.durationMinutes * 60_000),
              basePrice: s.basePrice,
            },
          });
          await tx.tripSeat.createMany({ data: s.bus.layout.seats.map((seat) => ({ tripId: trip.id, seatId: seat.id })) });
        });
        created++;
      }
    }
    return { created, skipped, schedules: schedules.length };
  }

  ensureScheduled(status: TripStatus) {
    if (status !== TripStatus.SCHEDULED) {
      throw new AppException(ErrorCode.CONFLICT, 'Chuyến không ở trạng thái có thể thay đổi', HttpStatus.CONFLICT);
    }
  }
}
