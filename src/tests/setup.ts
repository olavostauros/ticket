import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/ticket_test";
  process.env.JWT_SECRET = "test-secret";
  process.env.RESEND_API_KEY = "re_test";
  process.env.PUBLIC_APP_URL = "http://localhost:4321";
});