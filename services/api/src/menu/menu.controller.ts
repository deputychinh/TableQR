import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { uuidParam } from '../common/http/params.js';
import { parseBody } from '../common/http/validate.js';
import { tenantOf } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import {
  availabilitySchema,
  createCategorySchema,
  createItemSchema,
  createStationSchema,
  moveCategorySchema,
  updateCategorySchema,
  updateItemSchema,
  updateStationSchema,
} from './dto/menu.dto.js';
import {
  MenuService,
  type Category,
  type MenuItem,
  type StaffMenu,
  type Station,
} from './menu.service.js';

/** Who may do what with the menu (story TQR-006, "Roles"). */
const MENU_READERS = ['owner', 'cashier', 'waiter', 'kitchen'] as const;
/** The kitchen knows first when a dish runs out, so it may flip availability. */
const AVAILABILITY_WRITERS = ['owner', 'kitchen'] as const;

@Controller('menu')
@UseGuards(StaffGuard)
@Roles('owner')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @Roles(...MENU_READERS)
  getMenu(@CurrentPrincipal() principal: Principal): Promise<StaffMenu> {
    return this.menu.getMenu(tenantOf(principal));
  }

  @Post('stations')
  @HttpCode(201)
  createStation(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Station> {
    return this.menu.createStation(tenantOf(principal), parseBody(createStationSchema, body));
  }

  @Patch('stations/:id')
  updateStation(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Station> {
    return this.menu.updateStation(
      tenantOf(principal),
      uuidParam(id),
      parseBody(updateStationSchema, body),
    );
  }

  @Delete('stations/:id')
  @HttpCode(204)
  deleteStation(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.menu.deleteStation(tenantOf(principal), uuidParam(id));
  }

  @Post('categories')
  @HttpCode(201)
  createCategory(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Category> {
    return this.menu.createCategory(tenantOf(principal), parseBody(createCategorySchema, body));
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Category> {
    return this.menu.updateCategory(
      tenantOf(principal),
      uuidParam(id),
      parseBody(updateCategorySchema, body),
    );
  }

  @Post('categories/:id/move')
  @HttpCode(200)
  async moveCategory(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ categories: Category[] }> {
    const { direction } = parseBody(moveCategorySchema, body);
    const categories = await this.menu.moveCategory(tenantOf(principal), uuidParam(id), direction);
    return { categories };
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.menu.deleteCategory(tenantOf(principal), uuidParam(id));
  }

  @Post('items')
  @HttpCode(201)
  createItem(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<MenuItem> {
    return this.menu.createItem(tenantOf(principal), parseBody(createItemSchema, body));
  }

  @Patch('items/:id')
  updateItem(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MenuItem> {
    return this.menu.updateItem(
      tenantOf(principal),
      uuidParam(id),
      parseBody(updateItemSchema, body),
    );
  }

  @Put('items/:id/availability')
  @Roles(...AVAILABILITY_WRITERS)
  setAvailability(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MenuItem> {
    const { available } = parseBody(availabilitySchema, body);
    return this.menu.setAvailability(tenantOf(principal), uuidParam(id), available);
  }

  @Delete('items/:id')
  @HttpCode(204)
  deleteItem(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.menu.deleteItem(tenantOf(principal), uuidParam(id));
  }
}
