import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class CtaDto {
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsString() @MaxLength(240) href?: string;
}

class HeroDto {
  @IsOptional() @IsString() @MaxLength(120) eyebrow?: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(120) titleAccent?: string;
  @IsOptional() @IsString() @MaxLength(400) subtitle?: string;
  @IsOptional() @ValidateNested() @Type(() => CtaDto) primaryCta?: CtaDto;
  @IsOptional() @ValidateNested() @Type(() => CtaDto) secondaryCta?: CtaDto;
  @IsOptional() @IsString() @MaxLength(400) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(180) socialProof?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  avatars?: string[];
}

class TestimonialDto {
  @IsString() @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(400) avatar?: string;
  @IsString() @MaxLength(400) quote!: string;
}

class NewsletterDto {
  @IsOptional() @IsString() @MaxLength(120) heading?: string;
  @IsOptional() @IsString() @MaxLength(400) subheading?: string;
  @IsOptional() @IsString() @MaxLength(60) placeholder?: string;
  @IsOptional() @IsString() @MaxLength(40) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(240) finePrint?: string;
}

export class UpdateHomepageContentDto {
  @IsOptional() @ValidateNested() @Type(() => HeroDto) hero?: HeroDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TestimonialDto)
  testimonials?: TestimonialDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NewsletterDto)
  newsletter?: NewsletterDto;
}
