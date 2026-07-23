import type { ReactElement } from "react";

export default function PaymentSuccessIllustration(): ReactElement {
  return (
    <svg width="360" height="280" viewBox="0 0 360 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* พื้นหลังวงรีเบลอ */}
      <ellipse cx="180" cy="230" rx="140" ry="14" fill="#0F1B3D" fillOpacity="0.05" />
      <ellipse cx="180" cy="140" rx="150" ry="120" fill="#7C5CFF" fillOpacity="0.06" />

      {/* กระถางต้นไม้ */}
      <g>
        <path d="M56 200 L64 240 L92 240 L100 200 Z" fill="#0F1B3D" fillOpacity="0.75" />
        <ellipse cx="78" cy="200" rx="22" ry="6" fill="#0F1B3D" fillOpacity="0.9" />
        <path d="M78 195 C78 195 70 165 78 140" stroke="#7C5CFF" strokeWidth="4" strokeLinecap="round" />
        <path d="M78 175 C68 168 60 172 58 160" stroke="#7C5CFF" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M78 160 C88 153 96 157 98 145" stroke="#7C5CFF" strokeWidth="4" strokeLinecap="round" fill="none" />
      </g>

      {/* ดาวประกาย */}
      <g fill="#FFCB47">
        <path d="M210 45 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
        <path d="M240 60 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
      </g>

      {/* วงกลม checkmark ตรงกลาง */}
      <circle cx="200" cy="120" r="46" fill="#FF5A3C" />
      <circle cx="200" cy="120" r="46" stroke="#FFCB47" strokeWidth="3" strokeDasharray="6 6" opacity="0.6" />
      <path
        d="M180 120 L194 134 L222 104"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* ลูกบอลสีส้มที่นั่ง */}
      <ellipse cx="255" cy="225" rx="42" ry="34" fill="#FF5A3C" fillOpacity="0.9" />

      {/* คนนั่ง (แบบเรียบง่าย) */}
      <g>
        {/* ขา */}
        <path d="M232 232 L212 260" stroke="#0F1B3D" strokeWidth="10" strokeLinecap="round" />
        <path d="M260 235 L280 258" stroke="#0F1B3D" strokeWidth="10" strokeLinecap="round" />
        {/* รองเท้า */}
        <ellipse cx="207" cy="264" rx="10" ry="6" fill="#0F1B3D" />
        <ellipse cx="285" cy="262" rx="10" ry="6" fill="#0F1B3D" />
        {/* ลำตัว */}
        <path d="M238 195 Q250 185 262 195 L268 232 Q250 240 232 232 Z" fill="#FFCB47" />
        {/* แขน */}
        <path d="M240 205 L220 220" stroke="#FFCB47" strokeWidth="9" strokeLinecap="round" />
        <path d="M260 205 L275 195" stroke="#FFCB47" strokeWidth="9" strokeLinecap="round" />
        {/* หัว */}
        <circle cx="250" cy="180" r="18" fill="#F4B183" />
        {/* ผม */}
        <path
          d="M232 178 Q230 158 250 156 Q270 158 268 178 Q268 165 250 165 Q232 165 232 178Z"
          fill="#0F1B3D"
        />
      </g>
    </svg>
  );
}