import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpsertShippingMethodDto } from './dto/upsert-shipping-method.dto';
import { UpsertZoneDto } from './dto/upsert-zone.dto';
import {
  ShippingMethod,
  ShippingMethodDocument,
} from './schemas/shipping-method.schema';
import {
  ShippingZone,
  ShippingZoneDocument,
} from './schemas/shipping-zone.schema';

export interface ShippingQuote {
  zone: ShippingZone | null;
  methods: Array<{
    code: string;
    name: string;
    price: number;
    estimatedDays: number;
    free: boolean;
  }>;
}

@Injectable()
export class ShippingService {
  constructor(
    @InjectModel(ShippingMethod.name)
    private readonly methodModel: Model<ShippingMethodDocument>,
    @InjectModel(ShippingZone.name)
    private readonly zoneModel: Model<ShippingZoneDocument>,
  ) {}

  // ----- methods -----------------------------------------------------

  listPublic() {
    return this.methodModel
      .find({ active: true })
      .sort({ order: 1, price: 1 })
      .exec();
  }

  listAll() {
    return this.methodModel.find().sort({ order: 1, price: 1 }).exec();
  }

  upsertMethod(dto: UpsertShippingMethodDto) {
    return this.methodModel
      .findOneAndUpdate(
        { code: dto.code },
        { $set: dto },
        { upsert: true, new: true },
      )
      .exec();
  }

  async removeMethod(code: string) {
    const r = await this.methodModel.deleteOne({ code }).exec();
    if (!r.deletedCount) throw new NotFoundException('Shipping method not found');
  }

  // ----- zones -------------------------------------------------------

  listZones() {
    return this.zoneModel.find().sort({ name: 1 }).exec();
  }

  upsertZone(dto: UpsertZoneDto) {
    return this.zoneModel
      .findOneAndUpdate(
        { code: dto.code },
        { $set: dto },
        { upsert: true, new: true },
      )
      .exec();
  }

  async removeZone(code: string) {
    const r = await this.zoneModel.deleteOne({ code }).exec();
    if (!r.deletedCount) throw new NotFoundException('Zone not found');
  }

  /**
   * Resolve which methods + rates apply for a given destination. Falls back
   * to the universal method list when no zone matches so checkout never
   * gets stuck with zero options in dev.
   */
  async quote(
    destination: { country?: string; state?: string; city?: string; postal?: string },
    subtotal: number,
  ): Promise<ShippingQuote> {
    const zone = await this.matchZone(destination);
    const methodFilter = zone
      ? { active: true, code: { $in: zone.methodCodes } }
      : { active: true };

    const methods = await this.methodModel
      .find(methodFilter)
      .sort({ order: 1, price: 1 })
      .exec();

    return {
      zone,
      methods: methods.map((m) => {
        const free =
          m.freeAbove !== null &&
          m.freeAbove !== undefined &&
          subtotal >= m.freeAbove;
        return {
          code: m.code,
          name: m.name,
          price: free ? 0 : m.price,
          estimatedDays: m.estimatedDays,
          free,
        };
      }),
    };
  }

  private async matchZone(d: {
    country?: string;
    state?: string;
    city?: string;
    postal?: string;
  }): Promise<ShippingZone | null> {
    if (d.postal) {
      const prefix3 = d.postal.slice(0, 3);
      const byPostal = await this.zoneModel
        .findOne({ active: true, postalPrefixes: prefix3 })
        .exec();
      if (byPostal) return byPostal;
    }
    if (d.city) {
      const byCity = await this.zoneModel
        .findOne({ active: true, cities: d.city })
        .exec();
      if (byCity) return byCity;
    }
    if (d.state) {
      const byState = await this.zoneModel
        .findOne({ active: true, states: d.state })
        .exec();
      if (byState) return byState;
    }
    if (d.country) {
      const byCountry = await this.zoneModel
        .findOne({ active: true, countries: d.country })
        .exec();
      if (byCountry) return byCountry;
    }
    return null;
  }
}
