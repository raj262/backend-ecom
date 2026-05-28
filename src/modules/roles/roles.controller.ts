import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SCOPE_GROUPS, SCOPES } from '../../common/types/scopes';
import { UserRole } from '../../common/types/user-role.enum';
import { CreateRoleDto, UpdateRoleDto } from './dto/upsert-role.dto';
import { RolesService } from './roles.service';

/**
 * Admin-only role administration. Custom roles are created here; users
 * are assigned a role via `PATCH /admin/users/:id/role` (existing).
 */
@Roles(UserRole.ADMIN)
@Controller('admin/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list() {
    return this.roles.list();
  }

  /** Catalog of scopes admins can pick from when creating roles. */
  @Get('scopes')
  scopes() {
    return { all: SCOPES, groups: SCOPE_GROUPS };
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(key, dto);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('key') key: string) {
    await this.roles.remove(key);
  }
}
