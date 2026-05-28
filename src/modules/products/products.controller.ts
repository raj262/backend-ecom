import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  @Get()
  list(@Query() query: QueryProductsDto) {
    return this.products.paginate(query);
  }

  /** Vendor-scoped catalog: products owned by the calling vendor. */
  @Roles(UserRole.VENDOR, UserRole.ADMIN)
  @Get('mine')
  listMine(@CurrentUser() user: JwtUser, @Query() query: QueryProductsDto) {
    return this.products.paginate(query, { vendorId: user.sub });
  }

  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60_000)
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateProductDto) {
    return this.products.create(dto, user);
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto, user);
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.products.softDelete(id, user);
  }
}
