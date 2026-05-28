import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AnalyticsEventType } from '../schemas/analytics-event.schema';

export class TrackEventDto {
  @IsEnum(AnalyticsEventType) type!: AnalyticsEventType;
  @IsString() sessionId!: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() data?: Record<string, unknown>;
}
