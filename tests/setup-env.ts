import { config } from 'dotenv';

// Loaded before any module that reads process.env, so getEnv() sees the test
// database rather than the development one.
config({ path: '.env.test', override: true });
