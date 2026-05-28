import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@Roles(UserRole.ADMIN, UserRole.VENDOR)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query('productId') productId?: string) {
    return this.inventory.list(productId);
  }

  @Patch('adjust')
  adjust(@Body() dto: AdjustStockDto) {
    return this.inventory.adjust(dto);
  }
}
