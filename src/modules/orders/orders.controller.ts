import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { DecideReturnDto } from './dto/decide-return.dto';
import { OrdersService } from './orders.service';
import { GstInvoiceService } from './services/gst-invoice.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly gst: GstInvoiceService,
  ) {}

  @Get('mine')
  listMine(@CurrentUser() user: JwtUser) {
    return this.orders.listForUser(user.sub);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.orders.findOne(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.sub, dto);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.orders.cancel(user.sub, id);
  }

  /** Rebuild a cart-friendly payload from a past order. */
  @Get(':id/reorder')
  reorderDraft(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.orders.buildReorderDraft(user.sub, id);
  }

  /** Customer requests a return on a delivered order. */
  @Post(':id/return')
  requestReturn(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateReturnDto,
  ) {
    return this.orders.requestReturn(user.sub, id, dto);
  }

  /** Admin approves or rejects a return request. */
  @Roles(UserRole.ADMIN)
  @Patch(':id/return/decision')
  decideReturn(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: DecideReturnDto,
  ) {
    return this.orders.decideReturn(id, dto, user.sub);
  }

  /** Structured GST invoice (JSON). Used by the mobile app + admin UI. */
  @Get(':id/invoice')
  async invoice(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const order = await this.orders.findOne(user.sub, id);
    return this.gst.build(order);
  }

  /** Print-ready HTML invoice. Opens in a WebView on mobile. */
  @Get(':id/invoice.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async invoiceHtml(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const order = await this.orders.findOne(user.sub, id);
    const invoice = this.gst.build(order);
    res.send(this.gst.toHtml(invoice));
  }
}
