import { ImageResponse } from 'next/og';
import { appConfig } from '@/config/app-config';

export const runtime = 'edge';
export const alt = `${appConfig.name}: ${appConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const domainLabel = appConfig.appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background:
            'radial-gradient(circle at 20% 50%, rgba(79, 127, 255, 0.10) 0%, transparent 55%), #161618',
          padding: 64,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top: lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            width={56}
            height={56}
          >
            <g
              fill="none"
              stroke="#4F7FFF"
              strokeWidth={44}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M 140 96 L 140 416" />
              <path d="M 140 96 L 268 96 A 92 92 0 0 1 268 280 L 140 280" />
              <path
                d="M 56 188 L 168 188 L 196 150 L 224 226 L 252 188 L 360 188"
                strokeWidth={36}
              />
            </g>
          </svg>
          <span
            style={{
              color: '#FAFAFA',
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {appConfig.name}
          </span>
        </div>

        {/* Center: headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              color: '#FAFAFA',
              fontSize: 76,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            {appConfig.tagline}
          </div>
          <div
            style={{
              color: 'rgba(250, 250, 250, 0.65)',
              fontSize: 28,
              fontWeight: 400,
              letterSpacing: '-0.01em',
            }}
          >
            Tickets, contracts, conversations. One portal.
          </div>
        </div>

        {/* Bottom: footer + waveform */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              color: 'rgba(250, 250, 250, 0.45)',
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: '0.04em',
            }}
          >
            {domainLabel}
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 480 80"
            width={480}
            height={80}
          >
            <path
              d="M 0 40 L 140 40 L 170 16 L 200 64 L 230 24 L 260 40 L 480 40"
              fill="none"
              stroke="#4F7FFF"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
