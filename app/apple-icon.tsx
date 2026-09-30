import { ImageResponse } from 'next/og'

// иконка на домашний экран: тот же бумажный самолётик, что во вкладке, — riso-краски на бумаге
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f3eb' }}>
        <svg width="150" height="150" viewBox="-16 -16 32 32">
          <g transform="rotate(-24)">
            <path d="M13 0 L-10 -9 L-4 0 Z" fill="#ff48b0" stroke="#1d1d1b" strokeWidth="0.9" strokeLinejoin="round" />
            <path d="M13 0 L-4 0 L-9 6 Z" fill="#ff48b0" stroke="#1d1d1b" strokeWidth="0.9" strokeLinejoin="round" />
            <path d="M13 0 L-4 0 L-9 6 Z" fill="#0078bf" fillOpacity="0.6" />
          </g>
        </svg>
      </div>
    ),
    size,
  )
}
