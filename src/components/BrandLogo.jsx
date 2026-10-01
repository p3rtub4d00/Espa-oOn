export default function BrandLogo({
  className = '',
  showAdmin = false,
  name = 'ClubeOn',
  logoUrl = '',
  primaryColor = '#1f2937',
  secondaryColor = '#1769ff',
  accentColor = '#76d900',
}) {
  const accessibleName = name || 'ClubeOn'
  const isClubeOn = accessibleName.trim().toLowerCase() === 'clubeon'

  if (logoUrl) {
    return (
      <span className={`brand-logo brand-logo-custom ${className}`.trim()} aria-label={accessibleName}>
        <img className="brand-logo-image" src={logoUrl} alt={accessibleName} />
        {showAdmin && (
          <span className="brand-logo-custom-admin">
            <strong>{accessibleName}</strong>
            <small>Admin</small>
          </span>
        )}
      </span>
    )
  }

  return (
    <span className={`brand-logo ${className}`.trim()} aria-label={accessibleName}>
      <svg
        className="brand-logo-mark"
        viewBox="0 0 120 120"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="clubeOnCard" x1="24" y1="38" x2="86" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={secondaryColor} />
            <stop offset="1" stopColor={secondaryColor} />
          </linearGradient>
          <linearGradient id="clubeOnPower" x1="73" y1="68" x2="108" y2="103" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={accentColor} />
            <stop offset="1" stopColor={accentColor} />
          </linearGradient>
        </defs>

        <rect x="16" y="18" width="78" height="82" rx="20" fill={primaryColor} />
        <rect x="23" y="33" width="64" height="58" rx="13" fill="#ffffff" />
        <rect x="27" y="41" width="56" height="18" rx="7" fill="url(#clubeOnCard)" />
        <rect x="27" y="64" width="56" height="19" rx="7" fill={secondaryColor} opacity=".96" />
        <rect x="34" y="70" width="20" height="6" rx="3" fill="#ffffff" opacity=".95" />

        <rect x="31" y="9" width="11" height="25" rx="5.5" fill={primaryColor} />
        <rect x="68" y="9" width="11" height="25" rx="5.5" fill={primaryColor} />

        <circle cx="86" cy="84" r="25" fill="#ffffff" />
        <path
          d="M86 64a20 20 0 1 0 14.2 5.9"
          fill="none"
          stroke="url(#clubeOnPower)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M86 58v25"
          fill="none"
          stroke={accentColor}
          strokeWidth="9"
          strokeLinecap="round"
        />
      </svg>

      <span className={`brand-logo-word ${isClubeOn ? 'brand-logo-word-clubeon' : ''}`.trim()}>
        {isClubeOn ? (
          <span className="brand-logo-name">
            <span className="brand-logo-clube">Clube</span>
            <span className="brand-logo-on">On</span>
          </span>
        ) : (
          <span>{accessibleName}</span>
        )}
        {showAdmin && <small>Admin</small>}
      </span>
    </span>
  )
}
