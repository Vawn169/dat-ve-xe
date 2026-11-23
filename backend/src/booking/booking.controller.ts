import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators';
import { BookingService } from './booking.service';
import {
  AdminCancelDto,
  BlockSeatDto,
  ChangeTripDto,
  CheckinDto,
  CounterBookingDto,
  CreateBookingDto,
  HoldSeatsDto,
  ListBookingsQuery,
  LookupBookingDto,
  ReviewDto,
} from './dto/booking.dto';

@ApiTags('Sơ đồ ghế & giữ ghế')
@ApiBearerAuth()
@Controller('trips/:tripId')
export class SeatsController {
  constructor(private readonly booking: BookingService) {}

  /** Sơ đồ ghế kèm trạng thái: AVAILABLE, HELD, HELD_BY_ME, SOLD, BLOCKED; giá từng ghế, ghế dành cho nữ */
  @Public()
  @Get('seats')
  seatMap(@Param('tripId', ParseIntPipe) tripId: number, @CurrentUser() user?: AuthUser) {
    return this.booking.seatMap(tripId, user?.id);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('holds')
  hold(@Param('tripId', ParseIntPipe) tripId: number, @Body() dto: HoldSeatsDto, @CurrentUser() user: AuthUser) {
    return this.booking.holdSeats(tripId, dto.seatIds, user.id);
  }

  @Delete('holds')
  release(@Param('tripId', ParseIntPipe) tripId: number, @Body() dto: HoldSeatsDto, @CurrentUser() user: AuthUser) {
    return this.booking.releaseSeats(tripId, dto.seatIds, user.id);
  }

  /** F26: khóa / mở ghế không bán */
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @Post('seats/:seatId/block')
  block(@Param('tripId', ParseIntPipe) tripId: number, @Param('seatId', ParseIntPipe) seatId: number, @Body() dto: BlockSeatDto) {
    return this.booking.blockSeat(tripId, seatId, dto.blocked);
  }

  /** F27: hủy chuyến, hoàn tiền và báo khách */
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @Post('cancel')
  cancelTrip(@Param('tripId', ParseIntPipe) tripId: number) {
    return this.booking.cancelTrip(tripId);
  }
}

@ApiTags('Đặt vé')
@ApiBearerAuth()
@Controller('bookings')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthUser) {
    return this.booking.createBooking(user.id, dto);
  }

  /** "Vé của tôi" */
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.booking.listMine(user.id);
  }

  /** Tra cứu vé không cần đăng nhập (mã vé + SĐT). Giới hạn tần suất để chống dò mã. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('lookup')
  lookup(@Body() dto: LookupBookingDto) {
    return this.booking.lookup(dto.code, dto.phone);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get()
  adminList(@Query() q: ListBookingsQuery) {
    return this.booking.adminList(q);
  }

  @Get(':code')
  get(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    return this.booking.getForUser(code, user);
  }

  /** F15: tải vé PDF. Chủ vé (đăng nhập) hoặc ai có mã vé + ?phone= */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':code/pdf')
  async pdf(@Param('code') code: string, @Query('phone') phone: string | undefined, @CurrentUser() user: AuthUser | undefined, @Res() res: Response) {
    const buf = await this.booking.ticketPdf(code, user, phone);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ve-${code}.pdf"`);
    res.end(buf);
  }

  @HttpCode(200)
  @Post(':code/cancel')
  cancel(@Param('code') code: string, @CurrentUser() user: AuthUser, @Body() dto: AdminCancelDto) {
    return this.booking.cancel(code, user, dto?.fullRefund);
  }

  /** F19: đổi chuyến / đổi ngày */
  @HttpCode(200)
  @Post(':code/change')
  change(@Param('code') code: string, @CurrentUser() user: AuthUser, @Body() dto: ChangeTripDto) {
    return this.booking.changeTrip(code, user, dto);
  }

  /** F20: đánh giá chuyến đi */
  @Post(':code/review')
  review(@Param('code') code: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewDto) {
    return this.booking.review(code, user, dto);
  }
}

@ApiTags('Nhân viên nhà xe')
@ApiBearerAuth()
@Roles(Role.STAFF, Role.ADMIN)
@Controller('staff')
export class StaffController {
  constructor(private readonly booking: BookingService) {}

  /** F23: bán vé tại quầy, thu tiền mặt (ghế phải được nhân viên giữ trước qua /trips/:id/holds) */
  @Post('bookings')
  counter(@Body() dto: CounterBookingDto, @CurrentUser() user: AuthUser) {
    return this.booking.counterSale(user.id, dto);
  }

  /** F24: danh sách hành khách của chuyến */
  @Get('trips/:tripId/passengers')
  manifest(@Param('tripId', ParseIntPipe) tripId: number) {
    return this.booking.manifest(tripId);
  }

  /** F24: check-in bằng mã QR hoặc mã vé */
  @HttpCode(200)
  @Post('checkin')
  checkin(@Body() dto: CheckinDto) {
    return this.booking.checkin(dto.code);
  }
}
