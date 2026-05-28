import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Session, SessionDocument } from './schemas/session.schema';

export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  userAgent?: string;
  ip?: string;
}

export interface PublicSession {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  userAgent: string;
  ip: string;
  authMethod: string;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
  ) {}

  /**
   * Upsert a session row for this (user, device) and store the bcrypt
   * hash of the freshly-issued refresh token. Returns the active doc
   * so the caller can embed `sid` in the JWT payload.
   */
  async upsertOnLogin(
    userId: string,
    refreshToken: string,
    info: DeviceInfo,
    authMethod: string,
    saltRounds: number,
  ): Promise<SessionDocument> {
    const refreshTokenHash = await bcrypt.hash(refreshToken, saltRounds);
    const now = new Date();
    const userObjectId = new Types.ObjectId(userId);

    const doc = await this.sessionModel
      .findOneAndUpdate(
        { userId: userObjectId, deviceId: info.deviceId },
        {
          $set: {
            deviceName: info.deviceName ?? '',
            platform: info.platform ?? 'unknown',
            userAgent: info.userAgent ?? '',
            ip: info.ip ?? '',
            authMethod,
            refreshTokenHash,
            lastSeenAt: now,
            revokedAt: null,
          },
          $setOnInsert: {
            userId: userObjectId,
            deviceId: info.deviceId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .select('+refreshTokenHash')
      .exec();

    return doc!;
  }

  /**
   * Rotate the stored refresh token hash for an existing session.
   * Throws if the session has been revoked or doesn't exist.
   */
  async rotateRefreshToken(
    sessionId: string,
    newRefreshToken: string,
    saltRounds: number,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new ForbiddenException('Invalid session');
    }
    const hash = await bcrypt.hash(newRefreshToken, saltRounds);
    const res = await this.sessionModel
      .updateOne(
        { _id: sessionId, revokedAt: null },
        { $set: { refreshTokenHash: hash, lastSeenAt: new Date() } },
      )
      .exec();
    if (res.matchedCount === 0) {
      throw new ForbiddenException('Session revoked');
    }
  }

  /**
   * Load a session and verify the presented refresh token matches the
   * stored hash. Used by JwtRefreshGuard's downstream service.
   */
  async findActiveWithRefreshCheck(
    sessionId: string,
    presented: string,
  ): Promise<SessionDocument> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new ForbiddenException('Invalid session');
    }
    const session = await this.sessionModel
      .findById(sessionId)
      .select('+refreshTokenHash')
      .exec();
    if (!session || session.revokedAt || !session.refreshTokenHash) {
      throw new ForbiddenException('Session revoked');
    }
    const ok = await bcrypt.compare(presented, session.refreshTokenHash);
    if (!ok) throw new ForbiddenException('Refresh token mismatch');
    return session;
  }

  /** Soft-revoke a single session (logout this device). */
  async revoke(sessionId: string): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) return;
    await this.sessionModel
      .updateOne(
        { _id: sessionId },
        { $set: { revokedAt: new Date(), refreshTokenHash: null } },
      )
      .exec();
  }

  /** Revoke all sessions for a user except `exceptSessionId` (if any). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      revokedAt: null,
    };
    if (exceptSessionId && Types.ObjectId.isValid(exceptSessionId)) {
      filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
    }
    await this.sessionModel
      .updateMany(filter, {
        $set: { revokedAt: new Date(), refreshTokenHash: null },
      })
      .exec();
  }

  async listForUser(userId: string, currentSessionId?: string): Promise<PublicSession[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    const rows = await this.sessionModel
      .find({ userId: new Types.ObjectId(userId), revokedAt: null })
      .sort({ lastSeenAt: -1 })
      .exec();
    return rows.map((s) => this.toPublic(s, currentSessionId));
  }

  async getOwnedById(userId: string, sessionId: string): Promise<SessionDocument> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Session not found');
    }
    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session || session.userId.toString() !== userId) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  toPublic(doc: SessionDocument, currentSessionId?: string): PublicSession {
    const obj = doc.toJSON() as unknown as {
      _id: Types.ObjectId | string;
      deviceId: string;
      deviceName: string;
      platform: string;
      userAgent: string;
      ip: string;
      authMethod: string;
      lastSeenAt: Date;
      createdAt: Date;
    };
    const id = obj._id.toString();
    return {
      id,
      deviceId: obj.deviceId,
      deviceName: obj.deviceName,
      platform: obj.platform,
      userAgent: obj.userAgent,
      ip: obj.ip,
      authMethod: obj.authMethod,
      lastSeenAt: obj.lastSeenAt.toISOString(),
      createdAt: obj.createdAt.toISOString(),
      current: currentSessionId === id,
    };
  }
}
