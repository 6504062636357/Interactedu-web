import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai, Geist_Mono } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-sans-en",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-sans-th",
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
});

// เก็บ mono ไว้เผื่อใช้กับโค้ด/ตัวเลข ถ้าไม่ใช้แล้วลบทิ้งได้
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Interact Edu",
    template: "%s | Interact Edu",
  },
  description: "แพลตฟอร์มการเรียนรู้ออนไลน์สำหรับผู้เรียน ผู้สอน และสถาบันการศึกษา",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${notoSans.variable} ${notoSansThai.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ★ Polyfill crypto.randomUUID สำหรับ non-secure context (เปิดผ่าน http:// + IP)
            บน HTTP ตัว crypto.randomUUID เป็น undefined (มีเฉพาะ HTTPS/localhost) ทำให้ client
            component ที่เรียกใช้ throw แล้วหน้าพังทั้งหน้า — getRandomValues ใช้ได้บน HTTP อยู่แล้ว
            จึง fallback มาสร้าง UUID v4 เองได้ วิธีถาวรคือทำ HTTPS แล้วลบตัวนี้ทิ้งได้ */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var c=window.crypto;if(c&&typeof c.randomUUID!=='function'&&typeof c.getRandomValues==='function'){c.randomUUID=function(){var b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;var h=[];for(var i=0;i<16;i++){h.push((b[i]+0x100).toString(16).slice(1));}return h[0]+h[1]+h[2]+h[3]+'-'+h[4]+h[5]+'-'+h[6]+h[7]+'-'+h[8]+h[9]+'-'+h[10]+h[11]+h[12]+h[13]+h[14]+h[15];};}}catch(e){}})();",
          }}
        />
        {children}
      </body>
    </html>
  );
}
