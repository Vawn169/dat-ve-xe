import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public, Roles } from '../common/decorators/auth.decorators';
import { CatalogService } from './catalog.service';
import {
  CreateBusDto,
  CreateRouteDto,
  CreateSeatLayoutDto,
  CreateTripDto,
  GenerateTripsDto,
  ScheduleDto,
  SearchTripsDto,
  UpdateBusDto,
  UpdateRouteDto,
  UpdateSeatDto,
} from './dto/catalog.dto';

@ApiTags('Tuyến đường')
@ApiBearerAuth()
@Controller('routes')
export class RoutesController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  list(@Query('all') all?: string) {
    return this.catalog.listRoutes(all === '1');
  }

  @Public()
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.getRoute(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateRouteDto) {
    return this.catalog.createRoute(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRouteDto) {
    return this.catalog.updateRoute(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.deleteRoute(id);
  }
}

@ApiTags('Xe, sơ đồ ghế, lịch chạy')
@ApiBearerAuth()
@Controller()
export class FleetController {
  constructor(private readonly catalog: CatalogService) {}

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('seat-layouts')
  listLayouts() {
    return this.catalog.listSeatLayouts();
  }

  @Roles(Role.ADMIN)
  @Post('seat-layouts')
  createLayout(@Body() dto: CreateSeatLayoutDto) {
    return this.catalog.createSeatLayout(dto);
  }

  /** F10, F26: đặt ghế dành cho nữ, phụ thu ghế */
  @Roles(Role.ADMIN)
  @Patch('seats/:id')
  updateSeat(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSeatDto) {
    return this.catalog.updateSeat(id, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('buses')
  listBuses() {
    return this.catalog.listBuses();
  }

  @Roles(Role.ADMIN)
  @Post('buses')
  createBus(@Body() dto: CreateBusDto) {
    return this.catalog.createBus(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('buses/:id')
  updateBus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBusDto) {
    return this.catalog.updateBus(id, dto);
  }

  @Roles(Role.ADMIN)
  @Get('schedules')
  schedules() {
    return this.catalog.listSchedules();
  }

  @Roles(Role.ADMIN)
  @Post('schedules')
  createSchedule(@Body() dto: ScheduleDto) {
    return this.catalog.createSchedule(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('schedules/:id')
  updateSchedule(@Param('id', ParseIntPipe) id: number, @Body() dto: ScheduleDto) {
    return this.catalog.updateSchedule(id, dto);
  }

  /** F27: tạo chuyến hàng loạt từ lịch chạy */
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @Post('schedules/generate')
  generate(@Body() dto: GenerateTripsDto) {
    return this.catalog.generateTrips(dto.days);
  }
}

@ApiTags('Chuyến xe')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  search(@Query() q: SearchTripsDto) {
    return this.catalog.searchTrips(q);
  }

  /** Danh sách chuyến cho trang quản trị / nhân viên */
  @Roles(Role.ADMIN, Role.STAFF)
  @Get('manage/list')
  manage(@Query('date') date?: string) {
    return this.catalog.adminTrips(date);
  }

  @Public()
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.getTrip(id);
  }

  @Public()
  @Get(':id/reviews')
  reviews(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.tripReviews(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateTripDto) {
    return this.catalog.createTrip(dto);
  }
}
