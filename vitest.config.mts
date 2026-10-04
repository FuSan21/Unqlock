import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Popup and model tests in jsdom. The browser integration tests in tests/*.cjs run separately.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://extension.test/popup.html' } }
  }
});
