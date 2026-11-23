import { Body, Controller, Delete, Get, HttpStatus, Injectable, Module, Param, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingStatus, Prisma, Role, TripSeatStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { AppException, ErrorCode, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export class UpdateUserDto {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() isLocked?: boolean;
}

export class KbDto {
  @IsString() @Length(2, 200) title: string;
  @IsString() @Length(2, 10000) content: string;
}

export class StatsQuery {
  /** YYYY-MM-DD theo giờ Việt Nam */
  @Matches(/^\d{4}-\d{2}-\d{2}$/) from: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) to: string;
}

const vnStart = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- F29 người dùng ----------
  users(q?: string) {
    const s = q?.trim();
    return this.prisma.user.findMany({
      where: s ? { OR: [{ email: { contains: s, mode: 'insensitive' } }, { fullName: { contains: s, mode: 'insensitive' } }, { phone: { contains: s } }] } : {},
      select: { id: true, fullName: true, email: true, phone: true, role: true, isLocked: true, createdAt: true, _count: { select: { bookings: true } } },
      orderBy: { id: 'asc' },
      take: 300,
    });
  }

  async updateUser(id: number, me: AuthUser, dto: UpdateUserDto) {
    if (id === me.id) throw new AppException(ErrorCode.FORBIDDEN, 'Không tự đổi quyền hoặc tự khóa chính mình', HttpStatus.FORBIDDEN);
    if (!(await this.prisma.user.findUnique({ where: { id } }))) throw notFound('người dùng');
    return this.prisma.user.update({ where: { id }, data: dto, select: { id: true, role: true, isLocked: true } });
  }

  // ---------- F32 tri thức chatbot, lịch sử chat ----------
  kbList() {
    return this.prisma.kbDocument.findMany({ orderBy: { id: 'asc' } });
  }
  kbCreate(dto: KbDto) {
    return this.prisma.kbDocument.create({ data: dto });
  }
  async kbUpdate(id: number, dto: KbDto) {
    if (!(await this.prisma.kbDocument.findUnique({ where: { id } }))) throw notFound('tài liệu');
    return this.prisma.kbDocument.update({ where: { id }, data: dto });
  }
  async kbDelete(id: number) {
    await this.prisma.kbDocument.delete({ where: { id } });
    return { id };
  }
  async chats() {
    const sessions = await this.prisma.chatSession.findMany({
      include: { user: { select: { fullName: true } }, messages: { orderBy: { id: 'asc' } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return sessions.map((s) => ({ id: s.id, startedAt: s.startedAt, user: s.user?.fullName ?? 'Khách', count: s.messages.length, messages: s.messages }));
  }

  // ---------- F35 nhật ký, hộp thư ----------
  auditLogs() {
    return this.prisma.auditLog.findMany({ include: { user: { select: { fullName: true, role: true } } }, orderBy: { id: 'desc' }, take: 300 });
  }
  mails() {
    return this.prisma.mailLog.findMany({ orderBy: { id: 'desc' }, take: 200 });
  }

  // ---------- F30 thống kê ----------
  async stats(q: StatsQuery) {
    const from = vnStart(q.from);
    const to = new Date(vnStart(q.to).getTime() + 86_400_000);
    if (to <= from) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Khoảng ngày không hợp lệ');
    const paidWhere = { status: BookingStatus.PAID, trip: { departAt: { gte: from, lt: to } } };

    const [agg, tickets, byDay, byRoute, trips] = await Promise.all([
      this.prisma.booking.aggregate({ where: paidWhere, _sum: { totalAmount: true, discountAmount: true }, _count: true }),
      this.prisma.bookingItem.count({ where: { booking: paidWhere } }),
      this.prisma.$queryRaw<{ day: string; revenue: bigint; bookings: bigint }[]>(Prisma.sql`
        SELECT to_char(t.depart_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
               SUM(b.total_amount) AS revenue, COUNT(*) AS bookings
        FROM bookings b JOIN trips t ON t.id = b.trip_id
        WHERE b.status = 'PAID' AND t.depart_at >= ${from} AND t.depart_at < ${to}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<{ route: string; revenue: bigint; tickets: bigint }[]>(Prisma.sql`
        SELECT r.origin_city || ' → ' || r.destination_city AS route,
               SUM(bi.price) AS revenue, COUNT(bi.id) AS tickets
        FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id JOIN trips t ON t.id = b.trip_id JOIN routes r ON r.id = t.route_id
        WHERE b.status = 'PAID' AND t.depart_at >= ${from} AND t.depart_at < ${to}
        GROUP BY 1 ORDER BY 2 DESC`),
      this.prisma.trip.findMany({
        where: { departAt: { gte: from, lt: to } },
        include: { route: true, bus: true, tripSeats: { select: { status: true } } },
        orderBy: { departAt: 'asc' },
      }),
    ]);
    const tripRows = trips.map((t) => {
      const total = t.tripSeats.length;
      const sold = t.tripSeats.filter((s) => s.status === TripSeatStatus.SOLD).length;
      return {
        id: t.id,
        departAt: t.departAt,
        route: `${t.route.originCity} → ${t.route.destinationCity}`,
        busType: t.bus.busType,
        status: t.status,
        sold,
        total,
        occupancy: total ? Math.round((sold / total) * 1000) / 10 : 0,
      };
    });
    const seatsTotal = tripRows.reduce((s, t) => s + t.total, 0);
    const seatsSold = tripRows.reduce((s, t) => s + t.sold, 0);
    return {
      from: q.from,
      to: q.to,
      revenue: agg._sum.totalAmount ?? 0,
      discount: agg._sum.discountAmount ?? 0,
      bookings: agg._count,
      tickets,
      trips: tripRows.length,
      occupancy: seatsTotal ? Math.round((seatsSold / seatsTotal) * 1000) / 10 : 0,
      byDay: byDay.map((d) => ({ day: d.day, revenue: Number(d.revenue), bookings: Number(d.bookings) })),
      byRoute: byRoute.map((r) => ({ route: r.route, revenue: Number(r.revenue), tickets: Number(r.tickets) })),
      tripRows,
    };
  }

  async statsExcel(q: StatsQuery): Promise<Buffer> {
    const s = await this.stats(q);
    const wb = new ExcelJS.Workbook();
    const head = (ws: ExcelJS.Worksheet) => {
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B7A5E' } };
    };
    const sum = wb.addWorksheet('Tổng quan');
    sum.columns = [{ header: 'Chỉ số', key: 'k', width: 28 }, { header: 'Giá trị', key: 'v', width: 22 }];
    sum.addRows([
      { k: 'Từ ngày', v: s.from },
      { k: 'Đến ngày', v: s.to },
      { k: 'Doanh thu (VNĐ)', v: s.revenue },
      { k: 'Tổng giảm giá (VNĐ)', v: s.discount },
      { k: 'Số đơn đã thanh toán', v: s.bookings },
      { k: 'Số vé (ghế) đã bán', v: s.tickets },
      { k: 'Số chuyến', v: s.trips },
      { k: 'Tỉ lệ lấp đầy trung bình (%)', v: s.occupancy },
    ]);
    head(sum);
    const d = wb.addWorksheet('Theo ngày');
    d.columns = [{ header: 'Ngày', key: 'day', width: 14 }, { header: 'Doanh thu (VNĐ)', key: 'revenue', width: 18 }, { header: 'Số đơn', key: 'bookings', width: 10 }];
    d.addRows(s.byDay);
    head(d);
    const r = wb.addWorksheet('Theo tuyến');
    r.columns = [{ header: 'Tuyến', key: 'route', width: 34 }, { header: 'Doanh thu (VNĐ)', key: 'revenue', width: 18 }, { header: 'Số vé', key: 'tickets', width: 10 }];
    r.addRows(s.byRoute);
    head(r);
    const t = wb.addWorksheet('Lấp đầy theo chuyến');
    t.columns = [
      { header: 'Mã chuyến', key: 'id', width: 10 },
      { header: 'Khởi hành', key: 'when', width: 18 },
      { header: 'Tuyến', key: 'route', width: 34 },
      { header: 'Loại xe', key: 'busType', width: 20 },
      { header: 'Đã bán', key: 'sold', width: 9 },
      { header: 'Tổng ghế', key: 'total', width: 9 },
      { header: 'Lấp đầy (%)', key: 'occupancy', width: 11 },
    ];
    t.addRows(
      s.tripRows.map((x) => ({
        ...x,
        when: new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(x.departAt),
      })),
    );
    head(t);
    for (const ws of [sum, d, r]) ws.getColumn(2).numFmt = '#,##0';
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

@ApiTags('Quản trị')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users(@Query('q') q?: string) {
    return this.admin.users(q);
  }

  @Patch('users/:id')
  updateUser(@Param('id', ParseIntPipe) id: number, @CurrentUser() me: AuthUser, @Body() dto: UpdateUserDto) {
    return this.admin.updateUser(id, me, dto);
  }

  @Get('kb')
  kb() {
    return this.admin.kbList();
  }

  @Post('kb')
  kbCreate(@Body() dto: KbDto) {
    return this.admin.kbCreate(dto);
  }

  @Patch('kb/:id')
  kbUpdate(@Param('id', ParseIntPipe) id: number, @Body() dto: KbDto) {
    return this.admin.kbUpdate(id, dto);
  }

  @Delete('kb/:id')
  kbDelete(@Param('id', ParseIntPipe) id: number) {
    return this.admin.kbDelete(id);
  }

  @Get('chats')
  chats() {
    return this.admin.chats();
  }

  @Get('audit-logs')
  audit() {
    return this.admin.auditLogs();
  }

  /** Hộp thư thử nghiệm: email hệ thống đã gửi (bản xem trước chưa có máy chủ mail) */
  @Roles(Role.ADMIN, Role.STAFF)
  @Get('mails')
  mails() {
    return this.admin.mails();
  }

  @Get('stats')
  stats(@Query() q: StatsQuery) {
    return this.admin.stats(q);
  }

  @Get('stats/export')
  async export(@Query() q: StatsQuery, @Res() res: Response) {
    const buf = await this.admin.statsExcel(q);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="thong-ke-${q.from}_${q.to}.xlsx"`);
    res.end(buf);
  }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
