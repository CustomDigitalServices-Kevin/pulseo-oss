// @vitest-environment node
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { meanLuminance, detectLogoBackground } from './auto-detect';

async function solidPng(width: number, height: number, r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
}

describe('meanLuminance', () => {
  it('returns 0 for fully black RGB buffer', () => {
    const buf = Buffer.from([0, 0, 0, 0, 0, 0]);
    expect(meanLuminance(buf, 3)).toBeCloseTo(0, 1);
  });
  it('returns ~255 for fully white RGB buffer', () => {
    const buf = Buffer.from([255, 255, 255, 255, 255, 255]);
    expect(meanLuminance(buf, 3)).toBeCloseTo(255, 1);
  });
  it('ignores fully transparent pixels in RGBA buffer', () => {
    const buf = Buffer.from([0, 0, 0, 0, 255, 255, 255, 255]);
    expect(meanLuminance(buf, 4)).toBeCloseTo(255, 1);
  });
  it('falls back to "light" (255) when buffer is fully transparent', () => {
    const buf = Buffer.from([10, 10, 10, 0, 20, 20, 20, 0]);
    expect(meanLuminance(buf, 4)).toBe(255);
  });
});

describe('detectLogoBackground', () => {
  it('returns "light" for SVG (no rasterisation)', async () => {
    const fakeSvg = Buffer.from('<svg/>', 'utf8');
    const r = await detectLogoBackground(fakeSvg, 'image/svg+xml');
    expect(r).toBe('light');
  });

  it('returns "light" for a fully white PNG', async () => {
    const png = await solidPng(40, 40, 255, 255, 255);
    const r = await detectLogoBackground(png, 'image/png');
    expect(r).toBe('light');
  });

  it('returns "dark" for a fully black PNG', async () => {
    const png = await solidPng(40, 40, 0, 0, 0);
    const r = await detectLogoBackground(png, 'image/png');
    expect(r).toBe('dark');
  });
});
