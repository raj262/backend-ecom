import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateHomepageContentDto } from './dto/update-homepage-content.dto';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import {
  HomepageContent,
  HomepageContentDocument,
} from './schemas/homepage-content.schema';
import {
  SiteSettings,
  SiteSettingsDocument,
} from './schemas/site-settings.schema';

const SETTINGS_KEY = 'default';
const HOMEPAGE_KEY = 'default';

/**
 * Default seed payloads. On boot we upsert the singleton documents using
 * `$setOnInsert` so manual edits via the admin panel are never overwritten.
 */
const DEFAULT_NAV_LINKS = [
  { label: 'Home', href: '/', kind: 'default' as const },
  { label: 'Shop', href: '/shop', kind: 'default' as const },
  { label: 'New Arrivals', href: '/shop?sort=latest', kind: 'default' as const },
  { label: 'Best Sellers', href: '/shop?sort=popular', kind: 'default' as const },
  { label: 'Deals', href: '/shop?onSale=true', kind: 'highlight' as const },
  { label: 'Contact', href: '/contact', kind: 'default' as const },
];

const DEFAULT_FOOTER_COLUMNS = [
  {
    title: 'Shop',
    links: [
      { label: 'New Arrivals', href: '/shop?sort=latest', kind: 'default' as const },
      { label: 'Best Sellers', href: '/shop?sort=popular', kind: 'default' as const },
      { label: 'Sale', href: '/shop?onSale=true', kind: 'default' as const },
      { label: 'Gift Cards', href: '/shop', kind: 'default' as const },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Support Center', href: '/support', kind: 'default' as const },
      { label: 'Contact Us', href: '/contact', kind: 'default' as const },
      { label: 'Returns', href: '/return-policy', kind: 'default' as const },
      { label: 'Order Status', href: '/orders', kind: 'default' as const },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/contact', kind: 'default' as const },
      { label: 'Sustainability', href: '/contact', kind: 'default' as const },
      { label: 'Careers', href: '/contact', kind: 'default' as const },
      { label: 'Press', href: '/contact', kind: 'default' as const },
    ],
  },
];

const DEFAULT_TESTIMONIALS = [
  {
    name: 'Ava Mitchell',
    role: 'Verified buyer',
    rating: 5,
    avatar: 'https://picsum.photos/seed/t1/200',
    quote:
      "Quality is unreal. The linen shirt feels like something I'd find in a boutique in Paris. Already on my second order.",
  },
  {
    name: 'Jordan Lee',
    role: 'Stylist',
    rating: 5,
    avatar: 'https://picsum.photos/seed/t2/200',
    quote:
      'I dress clients for shoots and Lumière has become a staple. Pieces photograph beautifully and the fit is consistent.',
  },
  {
    name: 'Priya Shah',
    role: 'Verified buyer',
    rating: 4,
    avatar: 'https://picsum.photos/seed/t3/200',
    quote:
      'Sustainable, well made, and the packaging is gorgeous. It feels like a gift every time a box arrives.',
  },
];

const DEFAULT_AVATARS = [
  'https://picsum.photos/seed/avatar1/80',
  'https://picsum.photos/seed/avatar2/80',
  'https://picsum.photos/seed/avatar3/80',
  'https://picsum.photos/seed/avatar4/80',
];

@Injectable()
export class SiteContentService implements OnModuleInit {
  private readonly logger = new Logger(SiteContentService.name);

  constructor(
    @InjectModel(SiteSettings.name)
    private readonly settingsModel: Model<SiteSettingsDocument>,
    @InjectModel(HomepageContent.name)
    private readonly homepageModel: Model<HomepageContentDocument>,
  ) {}

  async onModuleInit() {
    await this.settingsModel.updateOne(
      { key: SETTINGS_KEY },
      {
        $setOnInsert: {
          key: SETTINGS_KEY,
          navLinks: DEFAULT_NAV_LINKS,
          footerColumns: DEFAULT_FOOTER_COLUMNS,
          announcementBar: {
            enabled: false,
            text: 'Free shipping on orders over $75',
            ctaLabel: 'Shop now',
            ctaHref: '/shop',
          },
        },
      },
      { upsert: true },
    );
    await this.homepageModel.updateOne(
      { key: HOMEPAGE_KEY },
      {
        $setOnInsert: {
          key: HOMEPAGE_KEY,
          hero: {
            primaryCta: { label: 'Shop the collection', href: '/shop' },
            secondaryCta: { label: 'Watch the lookbook', href: '#trending' },
            avatars: DEFAULT_AVATARS,
          },
          testimonials: DEFAULT_TESTIMONIALS,
        },
      },
      { upsert: true },
    );
    this.logger.log('Site content singletons ready.');
  }

  getSettings(): Promise<SiteSettingsDocument> {
    return this.settingsModel
      .findOneAndUpdate(
        { key: SETTINGS_KEY },
        { $setOnInsert: { key: SETTINGS_KEY } },
        { new: true, upsert: true },
      )
      .exec() as Promise<SiteSettingsDocument>;
  }

  getHomepage(): Promise<HomepageContentDocument> {
    return this.homepageModel
      .findOneAndUpdate(
        { key: HOMEPAGE_KEY },
        { $setOnInsert: { key: HOMEPAGE_KEY } },
        { new: true, upsert: true },
      )
      .exec() as Promise<HomepageContentDocument>;
  }

  async updateSettings(
    patch: UpdateSiteSettingsDto,
  ): Promise<SiteSettingsDocument> {
    return this.settingsModel
      .findOneAndUpdate(
        { key: SETTINGS_KEY },
        { $set: patch },
        { new: true, upsert: true },
      )
      .exec() as Promise<SiteSettingsDocument>;
  }

  async updateHomepage(
    patch: UpdateHomepageContentDto,
  ): Promise<HomepageContentDocument> {
    return this.homepageModel
      .findOneAndUpdate(
        { key: HOMEPAGE_KEY },
        { $set: patch },
        { new: true, upsert: true },
      )
      .exec() as Promise<HomepageContentDocument>;
  }
}
