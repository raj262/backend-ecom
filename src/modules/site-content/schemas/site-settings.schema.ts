import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SiteSettingsDocument = HydratedDocument<SiteSettings>;

/** Header/footer link rendered in the storefront. */
@Schema({ _id: false })
export class SiteNavLink {
  @Prop({ required: true }) label!: string;
  @Prop({ required: true }) href!: string;
  /** Visual treatment: 'default' | 'highlight' (used for "Deals"). */
  @Prop({ type: String, default: 'default' }) kind!: 'default' | 'highlight';
}
export const SiteNavLinkSchema = SchemaFactory.createForClass(SiteNavLink);

@Schema({ _id: false })
export class SiteFooterColumn {
  @Prop({ required: true }) title!: string;
  @Prop({ type: [SiteNavLinkSchema], default: [] })
  links!: SiteNavLink[];
}
export const SiteFooterColumnSchema =
  SchemaFactory.createForClass(SiteFooterColumn);

@Schema({ _id: false })
export class SiteSocial {
  @Prop({ default: '' }) instagram!: string;
  @Prop({ default: '' }) facebook!: string;
  @Prop({ default: '' }) twitter!: string;
  @Prop({ default: '' }) youtube!: string;
  @Prop({ default: '' }) linkedin!: string;
}
export const SiteSocialSchema = SchemaFactory.createForClass(SiteSocial);

@Schema({ _id: false })
export class SiteAnnouncementBar {
  @Prop({ default: false }) enabled!: boolean;
  @Prop({ default: '' }) text!: string;
  @Prop({ default: '' }) ctaLabel!: string;
  @Prop({ default: '' }) ctaHref!: string;
}
export const SiteAnnouncementBarSchema = SchemaFactory.createForClass(
  SiteAnnouncementBar,
);

/**
 * Singleton document — `key: 'default'` is unique. All storefront chrome
 * (brand, contact info, navigation, footer, announcement bar) reads from
 * here. Edited via `PUT /admin/site/settings`.
 */
@Schema({ timestamps: true, versionKey: false })
export class SiteSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  // Branding
  @Prop({ required: true, default: 'Lumière' }) siteName!: string;
  @Prop({ default: 'Style that moves with you' }) tagline!: string;
  /** Single character/short word used inside the logo badge. */
  @Prop({ default: 'L' }) logoMark!: string;
  @Prop({ default: '' }) logoImageUrl!: string;
  @Prop({
    default:
      'Crafted essentials and elevated everyday pieces. Designed slow, made to last, made for you.',
  })
  footerBlurb!: string;

  // Contact
  @Prop({ default: 'hello@lumiere.example' }) supportEmail!: string;
  @Prop({ default: '+1 (415) 555-0142' }) supportPhone!: string;
  @Prop({ default: '548 Market Street, San Francisco, CA 94104' })
  address!: string;

  @Prop({ type: SiteSocialSchema, default: () => ({}) })
  social!: SiteSocial;

  // Navigation + footer
  @Prop({ type: [SiteNavLinkSchema], default: [] })
  navLinks!: SiteNavLink[];

  @Prop({ type: [SiteFooterColumnSchema], default: [] })
  footerColumns!: SiteFooterColumn[];

  @Prop({ default: 'Lumière' }) footerCopyrightName!: string;

  @Prop({ type: SiteAnnouncementBarSchema, default: () => ({}) })
  announcementBar!: SiteAnnouncementBar;
}

export const SiteSettingsSchema = SchemaFactory.createForClass(SiteSettings);
