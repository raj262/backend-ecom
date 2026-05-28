import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RegisterDeviceDto } from './dto/register-device.dto';
import {
  DeviceToken,
  DeviceTokenDocument,
} from './schemas/device-token.schema';

/**
 * Manages the per-user list of Expo push tokens. Upserts on
 * `(userId, deviceId)` so re-logging in on the same phone simply
 * refreshes the token instead of growing a tail of dead rows.
 */
@Injectable()
export class DevicesService {
  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceModel: Model<DeviceTokenDocument>,
  ) {}

  async register(userId: string, dto: RegisterDeviceDto) {
    const oid = new Types.ObjectId(userId);
    // If the SAME token was previously bound to another account we
    // re-bind it to the current user (the phone changed hands). We
    // also bump `enabled` back to true so a phone re-launched after a
    // previous DeviceNotRegistered self-heals on next sign-in.
    const existing = await this.deviceModel.findOne({ token: dto.token }).exec();
    if (existing) {
      existing.userId = oid;
      existing.deviceId = dto.deviceId;
      existing.platform = dto.platform;
      existing.deviceModel = dto.deviceModel;
      existing.osVersion = dto.osVersion;
      existing.appVersion = dto.appVersion;
      existing.enabled = true;
      existing.lastSeenAt = new Date();
      existing.disabledAt = undefined;
      await existing.save();
      return existing;
    }
    // Also dedupe per device: an OS-side push-token rotation leaves
    // the deviceId stable, so clean up the previous row before
    // inserting the new one.
    await this.deviceModel
      .deleteMany({ userId: oid, deviceId: dto.deviceId })
      .exec();
    return this.deviceModel.create({
      userId: oid,
      token: dto.token,
      deviceId: dto.deviceId,
      platform: dto.platform,
      deviceModel: dto.deviceModel,
      osVersion: dto.osVersion,
      appVersion: dto.appVersion,
      enabled: true,
      lastSeenAt: new Date(),
    });
  }

  list(userId: string) {
    return this.deviceModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ lastSeenAt: -1 })
      .exec();
  }

  async unregisterByDeviceId(userId: string, deviceId: string) {
    const res = await this.deviceModel
      .deleteMany({ userId: new Types.ObjectId(userId), deviceId })
      .exec();
    if (res.deletedCount === 0) throw new NotFoundException('Device not found');
    return { ok: true, deleted: res.deletedCount };
  }

  async unregisterByToken(userId: string, token: string) {
    const res = await this.deviceModel
      .deleteOne({ userId: new Types.ObjectId(userId), token })
      .exec();
    if (res.deletedCount === 0) throw new NotFoundException('Device not found');
    return { ok: true };
  }
}
