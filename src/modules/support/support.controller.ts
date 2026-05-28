import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { CreateSupportTicketDto } from './dto/create-ticket.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('faq')
  @Public()
  faq() {
    return this.support.listFaq();
  }

  @Post('tickets')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateSupportTicketDto) {
    return this.support.createTicket(user.sub, dto);
  }

  @Get('tickets/me')
  myTickets(@CurrentUser() user: JwtUser) {
    return this.support.listMyTickets(user.sub);
  }
}
