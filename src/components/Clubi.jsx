import { useId } from 'react'
import './clubi.css'

// Vector artwork keeps the mascot sharp at avatar size, without image downloads.
export default function Clubi({ thinking = false, wave = false, className = '' }) {
  const id = useId().replace(/:/g, '')
  const paint = name => `url(#${id}-${name})`
  return <svg className={`clubi ${thinking ? 'clubi--thinking' : ''} ${wave ? 'clubi--wave' : ''} ${className}`} viewBox="0 0 160 170" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-shell`} x1="0" y1="0" x2=".85" y2="1"><stop stopColor="#fff"/><stop offset=".55" stopColor="#f3f7ff"/><stop offset="1" stopColor="#a9bedc"/></linearGradient>
      <linearGradient id={`${id}-screen`} x2=".7" y2="1"><stop stopColor="#1163da"/><stop offset=".55" stopColor="#073482"/><stop offset="1" stopColor="#051e55"/></linearGradient>
      <linearGradient id={`${id}-orange`} x2=".8" y2="1"><stop stopColor="#ffc44c"/><stop offset=".5" stopColor="#ff940a"/><stop offset="1" stopColor="#df6200"/></linearGradient>
    </defs>
    <ellipse cx="80" cy="160" rx="44" ry="5" fill="#153b73" opacity=".12"/>
    <g className="clubi-body">
      <path d="M55 146q-14 16 5 16h15v-18m13 0v18h15q19 0 5-16" fill={paint('shell')} stroke="#9dafca" strokeWidth="1.5"/>
      <path d="M53 102q-16 10-14 35l16 7m51-41q14 4 20 19" fill="none" stroke="#244d8a" strokeWidth="16" strokeLinecap="round"/>
      <path d="M53 103q-14 10-15 25" fill="none" stroke={paint('shell')} strokeWidth="14" strokeLinecap="round"/>
      <ellipse cx="39" cy="132" rx="11" ry="14" fill={paint('shell')} stroke="#a5b6cf"/>
      <path d="M56 96q-13 12-10 38t33 21q29 0 34-21t-13-38Z" fill={paint('shell')} stroke="#9dafca" strokeWidth="1.5"/>
      <path d="M89 116a12 12 0 1 0 0 17" fill="none" stroke="#1454be" strokeWidth="7" strokeLinecap="round"/>
      <circle cx="92" cy="124" r="5" fill={paint('orange')}/>
      <g className="clubi-arm">
        <path d="M109 113q18 5 19-19" fill="none" stroke="#244d8a" strokeWidth="15" strokeLinecap="round"/>
        <path d="M109 112q16 4 19-13" fill="none" stroke={paint('shell')} strokeWidth="12" strokeLinecap="round"/>
        <path d="m120 105 12 2" stroke={paint('orange')} strokeWidth="5"/>
        <path d="M121 95q-10-13-6-17t9 6q-2-24 4-23t6 18q7-17 12-12t-4 22q3-5 7-3t-4 15q-13 12-24-6Z" fill={paint('shell')} stroke="#a5b6cf" strokeWidth="1.2"/>
      </g>
      <g className="clubi-head">
        <path d="m74 29-4-15" stroke="#17417b" strokeWidth="6" strokeLinecap="round"/>
        <circle className="clubi-antenna" cx="69" cy="12" r="8" fill={paint('orange')}/>
        <ellipse cx="27" cy="67" rx="13" ry="23" fill={paint('orange')}/><ellipse cx="29" cy="67" rx="9" ry="19" fill="#16427e"/>
        <ellipse cx="130" cy="65" rx="11" ry="21" fill={paint('orange')}/><ellipse cx="129" cy="65" rx="7" ry="17" fill="#16427e"/>
        <rect x="26" y="25" width="104" height="81" rx="31" fill={paint('shell')} stroke="#a5b6cf" strokeWidth="1.5"/>
        <rect x="34" y="33" width="88" height="64" rx="24" fill={paint('screen')} stroke="#184a97" strokeWidth="2"/>
        <path d="M47 44q24-10 56-3" stroke="#6bafff" opacity=".45" strokeWidth="3" fill="none" strokeLinecap="round"/>
        <g className="clubi-eyes" fill="none" stroke="#72e8ff" strokeWidth="6" strokeLinecap="round"><path d="M49 68q8-16 16 0"/><path d="M90 68q8-16 16 0"/></g>
        <g className="clubi-thought-eyes" fill="#72e8ff"><ellipse cx="57" cy="65" rx="7" ry="10"/><ellipse cx="98" cy="65" rx="7" ry="10"/><circle cx="59" cy="62" r="3" fill="#fff"/><circle cx="100" cy="62" r="3" fill="#fff"/></g>
        <path d="M68 79q10 17 20 0Z" fill="#54d9ff"/>
      </g>
    </g>
  </svg>
}
