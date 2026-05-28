import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('product/:productId')
  listForProduct(@Param('productId') productId: string) {
    return this.reviews.listForProduct(productId);
  }

  @Public()
  @Get('product/:productId/summary')
  summaryForProduct(@Param('productId') productId: string) {
    return this.reviews.summaryForProduct(productId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.sub, dto);
  }

  @Post(':id/helpful')
  voteHelpful(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.reviews.voteHelpful(id, user.sub);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.reviews.remove(id, user);
  }
}
