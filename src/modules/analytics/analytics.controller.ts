import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @Get('overview')
  overview() {
    return this.analytics.overview();
  }

  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @Get('abandoned-carts')
  abandoned() {
    return this.analytics.abandonedCarts();
  }

  /**
   * Storefront beacon endpoint — POSTed from `navigator.sendBeacon` so we
   * accept anonymous traffic (sessionId is the only required correlator).
   */
  @Post('events')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  track(
    @Body() dto: TrackEventDto,
    @Req() req: Request & { user?: JwtUser },
    @Headers('referer') referer?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.analytics.track({
      type: dto.type,
      sessionId: dto.sessionId,
      userId: req.user?.sub ?? null,
      targetId: dto.targetId ?? null,
      data: dto.data,
      referer: referer ?? (req.headers.referer as string | undefined),
      userAgent,
    });
  }
}
