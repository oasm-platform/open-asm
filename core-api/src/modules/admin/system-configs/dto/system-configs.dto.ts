import {
  PresignUploadRequestDto,
  PresignUploadResponseDto,
} from '@/modules/storage/dto/presign-storage.dto';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Response DTO for system configuration
 */
export class SystemConfigResponseDto {
  @ApiProperty({ description: 'System name' })
  name: string;

  @ApiProperty({ description: 'Path to system logo', nullable: true })
  logoPath?: string | null;
}

/**
 * DTO for updating system configuration
 */
export class UpdateSystemConfigDto {
  @ApiPropertyOptional({ description: 'System name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Path to system logo' })
  @IsOptional()
  @IsString()
  logoPath?: string | null;
}

/** Account settings (`settings.auth`) */
export class AuthSettingsDto {
  @ApiPropertyOptional({
    description: 'Let anyone create an account through public sign-up',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowSignUp?: boolean;
}

/**
 * Mail service presets. Every one is sent over SMTP; the provider only tells
 * the console which host, port and username to fill in.
 */
export enum MailProvider {
  SMTP = 'smtp',
  RESEND = 'resend',
  SENDGRID = 'sendgrid',
  POSTMARK = 'postmark',
  MAILGUN = 'mailgun',
  SES = 'ses',
  BREVO = 'brevo',
  GMAIL = 'gmail',
}

/** Outgoing mail server (`settings.mailServer`), used for verification emails */
export class MailServerSettingsDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    enum: MailProvider,
    enumName: 'MailProvider',
    default: MailProvider.SMTP,
  })
  @IsOptional()
  @IsEnum(MailProvider)
  provider?: MailProvider;

  @ApiPropertyOptional({ example: 'smtp.example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @ApiPropertyOptional({ example: 587, default: 587 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({
    description: 'Implicit TLS, usually port 465; off means STARTTLS',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @ApiPropertyOptional({
    description:
      'Write-only password or API key, stored encrypted. Leave out or empty to keep the saved one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  password?: string;

  @ApiPropertyOptional({
    description: 'Read-only: whether a password is saved',
  })
  hasPassword?: boolean;

  @ApiPropertyOptional({ example: 'no-reply@example.com' })
  @ValidateIf((dto: MailServerSettingsDto) => !!dto.fromEmail)
  @IsEmail()
  fromEmail?: string;

  @ApiPropertyOptional({ description: 'Defaults to the system name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fromName?: string;
}

/**
 * Feature settings, one optional nested DTO per section. Adding a section
 * needs only a property here (`@ValidateNested()` + `@Type()`) and its
 * defaults in SystemConfigsService — no migration.
 */
export class SystemSettingsDto {
  @ApiPropertyOptional({ type: () => AuthSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthSettingsDto)
  auth?: AuthSettingsDto;

  @ApiPropertyOptional({ type: () => MailServerSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MailServerSettingsDto)
  mailServer?: MailServerSettingsDto;
}

export class SendTestMailDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  to: string;
}

export class LogoPresignRequestDto extends OmitType(PresignUploadRequestDto, [
  'bucket',
] as const) {}

export class LogoPresignResponseDto extends OmitType(PresignUploadResponseDto, [
  'contentType',
] as const) {}

export class ConfirmLogoRequestDto {
  @ApiProperty({
    example: 'logo-1a2b3c.png',
    description: 'Object key returned by the logo presign endpoint',
  })
  @IsString()
  @IsNotEmpty()
  key: string;
}
