import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-long!!';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-long!';
});

afterAll(async () => {
  await mongod?.stop();
});
