import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class NavLinkDto {
  @IsString() @MaxLength(60) label!: string;
  @IsString() @MaxLength(240) href!: string;
  @IsOptional() @IsIn(['default', 'highlight']) kind?: 'default' | 'highlight';
}

class FooterColumnDto {
  @IsString() @MaxLength(60) title!: string;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NavLinkDto)
  links!: NavLinkDto[];
}

class SocialDto {
  @IsOptional() @IsString() @MaxLength(240) instagram?: string;
  @IsOptional() @IsString() @MaxLength(240) facebook?: string;
  @IsOptional() @IsString() @MaxLength(240) twitter?: string;
  @IsOptional() @IsString() @MaxLength(240) youtube?: string;
  @IsOptional() @IsString() @MaxLength(240) linkedin?: string;
}

class AnnouncementBarDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(180) text?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(240) ctaHref?: string;
}

export class UpdateSiteSettingsDto {
  @IsOptional() @IsString() @MaxLength(60) siteName?: string;
  @IsOptional() @IsString() @MaxLength(180) tagline?: string;
  @IsOptional() @IsString() @MaxLength(4) logoMark?: string;
  @IsOptional() @IsString() @MaxLength(240) logoImageUrl?: string;
  @IsOptional() @IsString() @MaxLength(400) footerBlurb?: string;

  @IsOptional() @IsString() @MaxLength(120) supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(60) supportPhone?: string;
  @IsOptional() @IsString() @MaxLength(240) address?: string;

  @IsOptional() @ValidateNested() @Type(() => SocialDto) social?: SocialDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NavLinkDto)
  navLinks?: NavLinkDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => FooterColumnDto)
  footerColumns?: FooterColumnDto[];

  @IsOptional() @IsString() @MaxLength(60) footerCopyrightName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnnouncementBarDto)
  announcementBar?: AnnouncementBarDto;
}
