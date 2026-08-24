// components/AuraBackground.tsx
// พื้นหลัง gradient โทน "ส้ม-น้ำเงิน" ตามสีแบรนด์ (#FF5A3C ส้ม, #0F1B3D น้ำเงินเข้ม)
// ใช้หลักการเดียวกับ "Solar Flare" เดิม แต่เพิ่มเลเยอร์น้ำเงินเข้าไปให้มีความคอนทราสต์และหรูขึ้น
// blur ปรับตามขนาดจอผ่าน AuraBackground.module.css (mobile เบลอน้อยกว่า, desktop เบลอมากกว่า)
//
// สำคัญ: ต้องตั้ง background-color บน <body> (หรือ wrapper นอกสุดของหน้า) เป็นสีพื้นอ่อน
// ห้ามตั้ง background-color บน container นี้เอง เพราะ mix-blend-mode ต้องไป blend กับพื้นหลังของหน้า
import type { ReactElement, ReactNode } from "react";
import styles from "./AuraBackground.module.css";

export default function AuraBackground({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className={styles.wrap}>
      <div className={`${styles.layer} ${styles.layer1}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.layer2}`} aria-hidden="true" />
      <div className={`${styles.layer} ${styles.layer3}`} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </div>
  );
}