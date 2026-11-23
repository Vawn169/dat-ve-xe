import { BookingStatus, Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const PHONE = /^0\d{9}$/;
const PHONE_MSG = 'Số điện thoại phải gồm 10 số và bắt đầu bằng 0';

export class HoldSeatsDto {
  /** Danh sách id ghế (seatId trong sơ đồ) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  seatIds: number[];
}

export class PassengerDto {
  @IsOptional() @IsString() @Length(0, 100) name?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsInt() @Min(0) @Max(120) age?: number;
}

export class CreateBookingDto {
  @IsInt() tripId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  seatIds: number[];

  @IsInt() pickupStopId: number;
  @IsInt() dropoffStopId: number;

  @IsString() @Length(2, 100) contactName: string;
  @Matches(PHONE, { message: PHONE_MSG }) contactPhone: string;
  @IsEmail() contactEmail: string;

  /** Thông tin hành khách theo đúng thứ tự seatIds (tên, giới tính, tuổi) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers?: PassengerDto[];

  /** (Cũ) tên hành khách theo thứ tự seatIds */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  passengerNames?: string[];

  /** Mã giảm giá (F12) */
  @IsOptional() @IsString() @Length(3, 20) couponCode?: string;
}

/** Bán vé tại quầy (F23): email không bắt buộc */
export class CounterBookingDto {
  @IsInt() tripId: number;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsInt({ each: true }) seatIds: number[];
  @IsInt() pickupStopId: number;
  @IsInt() dropoffStopId: number;
  @IsString() @Length(2, 100) contactName: string;
  @Matches(PHONE, { message: PHONE_MSG }) contactPhone: string;
  @IsOptional() @ValidateIf((o) => o.contactEmail !== '') @IsEmail() contactEmail?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PassengerDto) passengers?: PassengerDto[];
}

export class LookupBookingDto {
  /** Mã vé, ví dụ VE7K3QZ9MP */
  @IsString() @Length(6, 20) code: string;
  @Matches(PHONE, { message: PHONE_MSG }) phone: string;
}

export class ListBookingsQuery {
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @Type(() => Number) @IsInt() tripId?: number;
  /** Tìm theo mã vé, số điện thoại, tên */
  @IsOptional() @IsString() q?: string;
}

export class ChangeTripDto {
  @IsInt() tripId: number;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsInt({ each: true }) seatIds: number[];
}

export class ReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @Length(0, 1000) comment?: string;
}

export class AdminCancelDto {
  /** Hoàn toàn bộ tiền (khi lỗi từ phía nhà xe) thay vì theo chính sách */
  @IsOptional() @IsBoolean() fullRefund?: boolean;
}

export class CheckinDto {
  /** Mã vé hoặc nội dung mã QR (DVX|MAVE) */
  @IsString() @Length(6, 40) code: string;
}

export class BlockSeatDto {
  @IsBoolean() blocked: boolean;
}
