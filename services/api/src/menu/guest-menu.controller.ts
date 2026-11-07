import { Controller, Get, Param } from '@nestjs/common';
import { notFound } from './menu.errors.js';
import { MenuService, type GuestMenu } from './menu.service.js';

const SLUG = /^[a-z0-9-]{1,80}$/u;

/**
 * Public, read-only menu by restaurant slug (AC5, AC6). The menu is public information, so the
 * tenant comes from the slug; ordering (TQR-012) resolves the tenant from the table token instead.
 */
@Controller('g/r')
export class GuestMenuController {
  constructor(private readonly menu: MenuService) {}

  @Get(':slug/menu')
  getMenu(@Param('slug') slug: string): Promise<GuestMenu> {
    if (!SLUG.test(slug)) throw notFound();
    return this.menu.guestMenu(slug);
  }
}
