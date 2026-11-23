import { Gender } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min, MinLength } from 'class-validator';

const PHONE = /^0\d{9}$/;
const PHONE_MSG = 'Số điện thoại phải gồm 10 số và bắt đầu bằng 0';

export class RegisterDto {
  /** Họ tên */
  @IsString()
  @Length(2, 100)
  fullName: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  /** Số điện thoại 10 số, bắt đầu bằng 0 */
  @Matches(PHONE, { message: PHONE_MSG })
  phone: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;
}

export class ResetPasswordDto {
  @IsString() @Length(20, 200) token: string;
  @IsString() @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' }) password: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(2, 100) fullName?: string;
  @IsOptional() @Matches(PHONE, { message: PHONE_MSG }) phone?: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8, { message: 'Mật khẩu mới tối thiểu 8 ký tự' }) newPassword: string;
}

export class SavedPassengerDto {
  @IsString() @Length(2, 100) fullName: string;
  @IsOptional() @Matches(PHONE, { message: PHONE_MSG }) phone?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsInt() @Min(0) @Max(120) age?: number;
}
