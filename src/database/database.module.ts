import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Central place to wire Mongoose. Today `AppModule` still imports
 * `MongooseModule.forRootAsync` directly for backwards compatibility, but
 * new modules can import `DatabaseModule` instead. Useful when we add a
 * second connection (e.g. an analytics replica) or read/write splitting.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        autoIndex: process.env.NODE_ENV !== 'production',
      }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
