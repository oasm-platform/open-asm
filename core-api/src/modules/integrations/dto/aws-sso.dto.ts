import { IsCronSchedule } from '@/modules/asset-group/dto/cron-schedule.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Step 1 of the AWS SSO device-authorization flow: register + start. */
export class AwsSsoDeviceDto {
  @ApiProperty({
    example: 'us-east-1',
    description: 'AWS region hosting the IAM Identity Center instance',
  })
  @IsString()
  @IsNotEmpty()
  region: string;

  @ApiProperty({
    example: 'https://my-sso-portal.awsapps.com/start',
    description: 'IAM Identity Center start URL',
  })
  @IsString()
  @IsNotEmpty()
  startUrl: string;
}

/** Step 2: poll `CreateToken` with the device code until authorized. */
export class AwsSsoPollDto {
  @ApiProperty({ example: 'us-east-1' })
  @IsString()
  @IsNotEmpty()
  region: string;

  @ApiProperty({ description: 'OIDC client id from the device step' })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({ description: 'OIDC client secret from the device step' })
  @IsString()
  @IsNotEmpty()
  clientSecret: string;

  @ApiProperty({ description: 'Device code from the device step' })
  @IsString()
  @IsNotEmpty()
  deviceCode: string;
}

/** Step 3: persist the selected account/role as an integration. */
export class AwsSsoCompleteDto {
  @ApiProperty({ example: 'AWS SSO' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'us-east-1' })
  @IsString()
  @IsNotEmpty()
  region: string;

  @ApiProperty({ example: 'https://my-sso-portal.awsapps.com/start' })
  @IsString()
  @IsNotEmpty()
  startUrl: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  roleName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientSecret: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiProperty({
    required: false,
    description:
      'Cron schedule for periodic asset sync (5-field cron or "disabled")',
    example: 'disabled',
  })
  @IsOptional()
  @IsCronSchedule()
  syncSchedule?: string;
}
