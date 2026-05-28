import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import {
  TestIntegrationDto,
  UpsertIntegrationDto,
} from './dto/upsert-integration.dto';
import { IntegrationKey } from './schemas/integration.schema';
import { IntegrationTestService } from './services/integration-test.service';
import { IntegrationsService } from './services/integrations.service';

/**
 * Admin-only routes for managing the integration registry.
 *
 *   GET    /admin/integrations           → list all 4 slots (redacted)
 *   GET    /admin/integrations/catalog   → provider catalog (drives the UI)
 *   GET    /admin/integrations/:key      → one slot (redacted)
 *   PUT    /admin/integrations/:key      → upsert provider + credentials
 *   PATCH  /admin/integrations/:key/enabled → toggle
 *   POST   /admin/integrations/:key/test → probe / send a live test message
 *
 * Credentials NEVER come back in plaintext. The UI sees only
 * `credentialsSet: { field: true|false }` so it can render "•••• set"
 * vs. "Not set" without ever holding the secret.
 */
@Roles(UserRole.ADMIN)
@Controller('admin/integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly tester: IntegrationTestService,
  ) {}

  @Get()
  list() {
    return this.integrations.listPublic();
  }

  @Get('catalog')
  catalog() {
    return this.integrations.catalog();
  }

  @Get(':key')
  getOne(
    @Param('key', new ParseEnumPipe(IntegrationKey)) key: IntegrationKey,
  ) {
    return this.integrations.getPublic(key);
  }

  @Put(':key')
  upsert(
    @Param('key', new ParseEnumPipe(IntegrationKey)) key: IntegrationKey,
    @Body() dto: UpsertIntegrationDto,
  ) {
    return this.integrations.upsert(key, dto);
  }

  @Patch(':key/enabled')
  setEnabled(
    @Param('key', new ParseEnumPipe(IntegrationKey)) key: IntegrationKey,
    @Body() body: { enabled: boolean },
  ) {
    return this.integrations.setEnabled(key, !!body.enabled);
  }

  @Post(':key/test')
  test(
    @Param('key', new ParseEnumPipe(IntegrationKey)) key: IntegrationKey,
    @Body() dto: TestIntegrationDto,
  ) {
    return this.tester.test(key, dto.to);
  }
}
