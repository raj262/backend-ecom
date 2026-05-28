import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat.dto';
import { ClassifyDto } from './dto/classify.dto';
import { TrackSearchDto } from './dto/trending.dto';
import { TrendingSearchService } from './trending-search.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly trending: TrendingSearchService,
  ) {}

  @Get('recommend')
  @Public()
  recommend(@Query('productId') productId: string) {
    return this.ai.recommend(productId);
  }

  /**
   * Authenticated personalised rail — requires a JWT so the service
   * can look up the caller's past orders. Not marked `@Public()`.
   */
  @Get('for-you')
  forYou(@CurrentUser() user: JwtUser, @Query('limit') limit?: string) {
    const n = Number.parseInt(limit ?? '', 10);
    return this.ai.forYou(
      user.sub,
      Number.isFinite(n) && n > 0 ? Math.min(n, 24) : 12,
    );
  }

  @Get('bought-together')
  @Public()
  boughtTogether(
    @Query('productId') productId: string,
    @Query('limit') limit?: string,
  ) {
    const n = Number.parseInt(limit ?? '', 10);
    return this.ai.boughtTogether(
      productId,
      Number.isFinite(n) && n > 0 ? Math.min(n, 6) : 3,
    );
  }

  @Get('autocomplete')
  @Public()
  autocomplete(@Query('q') q: string) {
    return this.ai.autocomplete(q ?? '');
  }

  @Post('chat/classify')
  @Public()
  classify(@Body() dto: ClassifyDto) {
    return this.ai.classify(dto.message);
  }

  /**
   * Conversational endpoint backing the mobile "Lumi" assistant.
   * Stateless: the client sends the relevant history each turn.
   */
  @HttpCode(HttpStatus.OK)
  @Post('chat')
  @Public()
  chat(@Body() dto: ChatRequestDto) {
    return this.ai.chat(dto.message, dto.history ?? []);
  }

  /** Top search terms — fuels the mobile "Trending" chip rail. */
  @Get('trending')
  @Public()
  trendingList(@Query('limit') limit?: string) {
    const n = Number.parseInt(limit ?? '', 10);
    return this.trending.top(Number.isFinite(n) && n > 0 ? n : 10);
  }

  /** Increment the popularity of a committed search term. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('trending/track')
  @Public()
  async track(@Body() dto: TrackSearchDto): Promise<void> {
    await this.trending.track(dto.term);
  }
}
