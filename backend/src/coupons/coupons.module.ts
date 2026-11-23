import { Body, Controller, Get, HttpCode, HttpStatus, Injectable, Module, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Coupon, Role } from '@prisma/client';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Public, Roles } from '../common/decorators/auth.decorators';
import { AppException, ErrorCode, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export class CouponDto {
  @Matches(/^[A-Z0-9]{3,20}$/, { message: 'Mã gồm 3–20 chữ in hoa hoặc số' }) code: string;
  @IsOptional() @IsString() @Length(0, 200) description?: string;
  /** Giảm theo % (1–100). Điền percent hoặc amount */
  @IsOptional() @IsInt() @Min(1) @Max(100) percent?: number;
  /** Giảm số tiền cố định (VNĐ) */
  @IsOptional() @IsInt() @Min(1000) amount?: number;
  @IsOptional() @IsInt() @Min(0) maxDiscount?: number;
  @IsOptional() @IsInt() @Min(0) minOrder?: number;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @IsISO8601() validFrom: string;
  @IsISO8601() validTo: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCouponDto extends PartialType(CouponDto) {}

export class CheckCouponDto {
  @IsString() @Length(3, 20) code: string;
  /** Tạm tính đơn hàng (VNĐ) */
  @IsInt() @Min(0) amount: number;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Kiểm tra mã và tính số tiền giảm cho một đơn có tạm tính `subtotal` (F12). */
  async quote(code: string, subtotal: number): Promise<{ coupon: Coupon; discount: number }> {
    const c = await this.prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    const now = new Date();
    const bad = (msg: string) => new AppException(ErrorCode.COUPON_INVALID, msg, HttpStatus.BAD_REQUEST);
    if (!c || !c.isActive) throw bad('Mã giảm giá không tồn tại');
    if (now < c.validFrom) throw bad('Mã giảm giá chưa đến thời gian sử dụng');
    if (now > c.validTo) throw bad('Mã giảm giá đã hết hạn');
    if (c.usageLimit !== null && c.usedCount >= c.usageLimit) throw bad('Mã giảm giá đã hết lượt sử dụng');
    if (subtotal < c.minOrder) throw bad(`Đơn tối thiểu ${c.minOrder.toLocaleString('vi-VN')}đ để dùng mã này`);
    let discount = c.percent ? Math.round((subtotal * c.percent) / 100) : (c.amount ?? 0);
    if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
    discount = Math.min(discount, subtotal);
    return { coupon: c, discount };
  }

  list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(dto: CouponDto) {
    this.validate(dto);
    return this.prisma.coupon.create({ data: { ...dto, code: dto.code.toUpperCase() } });
  }

  async update(id: number, dto: UpdateCouponDto) {
    const old = await this.prisma.coupon.findUnique({ where: { id } });
    if (!old) throw notFound('mã giảm giá');
    this.validate({ ...old, ...dto } as CouponDto);
    return this.prisma.coupon.update({ where: { id }, data: { ...dto, code: dto.code?.toUpperCase() } });
  }

  private validate(d: Partial<CouponDto>) {
    if (!d.percent && !d.amount) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Phải nhập % giảm hoặc số tiền giảm');
    if (d.validFrom && d.validTo && new Date(d.validTo) <= new Date(d.validFrom)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Ngày hết hạn phải sau ngày bắt đầu');
    }
  }
}

@ApiTags('Mã giảm giá')
@ApiBearerAuth()
@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  /** F12: khách kiểm tra mã trước khi đặt */
  @Public()
  @HttpCode(200)
  @Post('coupons/check')
  async check(@Body() dto: CheckCouponDto) {
    const { coupon, discount } = await this.coupons.quote(dto.code, dto.amount);
    return { code: coupon.code, description: coupon.description, discount, total: dto.amount - discount };
  }

  /** F31: quản lý mã giảm giá */
  @Roles(Role.ADMIN)
  @Get('admin/coupons')
  list() {
    return this.coupons.list();
  }

  @Roles(Role.ADMIN)
  @Post('admin/coupons')
  create(@Body() dto: CouponDto) {
    return this.coupons.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch('admin/coupons/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }
}

@Module({ controllers: [CouponsController], providers: [CouponsService], exports: [CouponsService] })
export class CouponsModule {}
