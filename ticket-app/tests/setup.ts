// Test setup — configures test environment and mocks
import { beforeAll, expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

beforeAll(() => {
  // Set required environment variables for tests
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.RESEND_API_KEY = "re_test";
  process.env.ABACATEPAY_API_KEY = "apk_test";
  process.env.ABACATEPAY_WEBHOOK_SECRET = "whsec_test";
  process.env.JOB_PROCESSOR_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});