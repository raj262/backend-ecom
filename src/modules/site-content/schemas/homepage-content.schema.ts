import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HomepageContentDocument = HydratedDocument<HomepageContent>;

@Schema({ _id: false })
export class HomepageCta {
  @Prop({ default: '' }) label!: string;
  @Prop({ default: '' }) href!: string;
}
export const HomepageCtaSchema = SchemaFactory.createForClass(HomepageCta);

@Schema({ _id: false })
export class HomepageHero {
  @Prop({ default: 'New Season Drop — Autumn 2026' }) eyebrow!: string;
  @Prop({ default: 'Style that moves' }) title!: string;
  @Prop({ default: 'with you.' }) titleAccent!: string;
  @Prop({
    default:
      'Discover thoughtfully designed essentials and statement pieces, curated for the everyday and the unforgettable.',
  })
  subtitle!: string;
  @Prop({ type: HomepageCtaSchema, default: () => ({}) })
  primaryCta!: HomepageCta;
  @Prop({ type: HomepageCtaSchema, default: () => ({}) })
  secondaryCta!: HomepageCta;
  @Prop({ default: 'https://picsum.photos/seed/hero-fashion/1000/1250' })
  imageUrl!: string;
  @Prop({ default: '4.9/5 from 12,000+ happy customers' })
  socialProof!: string;
  /** Tiny avatar URLs used in the rating block. Up to 4 are shown. */
  @Prop({ type: [String], default: [] })
  avatars!: string[];
}
export const HomepageHeroSchema = SchemaFactory.createForClass(HomepageHero);

@Schema({ _id: false })
export class HomepageTestimonial {
  @Prop({ required: true }) name!: string;
  @Prop({ default: 'Verified buyer' }) role!: string;
  @Prop({ default: 5, min: 1, max: 5 }) rating!: number;
  @Prop({ default: '' }) avatar!: string;
  @Prop({ required: true }) quote!: string;
}
export const HomepageTestimonialSchema = SchemaFactory.createForClass(
  HomepageTestimonial,
);

@Schema({ _id: false })
export class HomepageNewsletter {
  @Prop({ default: 'Stay in the loop' }) heading!: string;
  @Prop({
    default:
      'Sign up for early access to new drops, members-only sales, and styling notes.',
  })
  subheading!: string;
  @Prop({ default: 'Enter your email' }) placeholder!: string;
  @Prop({ default: 'Subscribe' }) ctaLabel!: string;
  @Prop({
    default: 'We respect your inbox. Unsubscribe anytime.',
  })
  finePrint!: string;
}
export const HomepageNewsletterSchema = SchemaFactory.createForClass(
  HomepageNewsletter,
);

/**
 * Singleton — `key: 'default'`. Drives the storefront homepage content.
 */
@Schema({ timestamps: true, versionKey: false })
export class HomepageContent {
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ type: HomepageHeroSchema, default: () => ({}) })
  hero!: HomepageHero;

  @Prop({ type: [HomepageTestimonialSchema], default: [] })
  testimonials!: HomepageTestimonial[];

  @Prop({ type: HomepageNewsletterSchema, default: () => ({}) })
  newsletter!: HomepageNewsletter;
}

export const HomepageContentSchema =
  SchemaFactory.createForClass(HomepageContent);
