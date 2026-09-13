import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#500b50',
          borderRadius: '7px',
          border: '1px solid rgba(255, 255, 255, 0.25)',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Transmission Pylon Crossarms */}
          <path
            d="M4 8H20M7 13H17M2 18H22"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Central High-Voltage Lightning Bolt */}
          <polygon
            points="13 2 4 13 11 13 10 22 20 10 13 10 13 2"
            fill="#facc15"
            stroke="#eab308"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}