export default function BrandLogo({ className = '', showAdmin = false }) {
  return (
    <span className={`brand-logo ${className}`.trim()} aria-label="EspaçoOn">
      <svg
        className="brand-logo-mark"
        viewBox="0 0 120 120"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="brandDeep" x1="10" y1="10" x2="105" y2="105" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0B2E6D" />
            <stop offset=".55" stopColor="#0D50C8" />
            <stop offset="1" stopColor="#117CF1" />
          </linearGradient>
          <linearGradient id="brandLight" x1="15" y1="55" x2="108" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4CCBFF" />
            <stop offset="1" stopColor="#1188F4" />
          </linearGradient>
        </defs>

        <path
          d="M61 5C34 5 13 25 13 52c0 22 13 39 31 48l17 14 15-14c10-5 18-12 24-21-12 7-26 10-39 7-19-4-32-20-32-39 0-18 12-33 29-39 9-3 19-3 28 0H61Z"
          fill="url(#brandDeep)"
        />
        <path
          d="M23 55c9 20 27 31 47 30 12 0 24-4 33-11-8 15-21 26-37 31l-6 8-11-9C34 96 24 84 18 70c-2-5-3-10-3-15 2 0 5 0 8 0Z"
          fill="url(#brandLight)"
        />
        <path
          d="M36 73c14 9 30 12 46 8 9-2 17-6 25-11-7 12-18 21-31 26-14 5-31 4-45-3 10-2 19-8 25-15-7 1-14-1-20-5Z"
          fill="#49C7FF"
          opacity=".92"
        />

        <g transform="translate(45 34)">
          <rect x="0" y="8" width="42" height="33" rx="8" fill="#0A2E68" />
          <rect x="4" y="13" width="34" height="24" rx="5" fill="#08275B" />
          <rect x="9" y="0" width="5" height="13" rx="2.5" fill="#0D50C8" />
          <rect x="28" y="0" width="5" height="13" rx="2.5" fill="#0D50C8" />
          <path
            d="m13 26 7 7 12-15"
            fill="none"
            stroke="#1F8EFA"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      <span className="brand-logo-word">
        <span>Espaço</span><strong>On</strong>
        {showAdmin && <small>Admin</small>}
      </span>
    </span>
  )
}
