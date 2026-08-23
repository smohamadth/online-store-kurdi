/**
 * Test setup for the storefront.
 *
 * Provides fetch, a controlled `localStorage`, and a `NEXT_PUBLIC_API_URL`
 * stub that the lib helpers use. Anything that needs to call the real
 * fetch is stubbed at the test level.
 */

// `NEXT_PUBLIC_API_URL` is read by apiBase.ts at import time. Setting
// it before any module loads means every test gets a consistent base URL.
process.env.NEXT_PUBLIC_API_URL = 'http://test.api/api';
