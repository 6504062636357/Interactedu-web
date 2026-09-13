import type { ReactElement } from "react";
import Image from "next/image";

export default function PaymentSuccessIllustration(): ReactElement {
  return (
    <Image
      src="/payment-success.png"
      alt="Payment success"
      width={360}
      height={280}
      style={{ width: "100%", maxWidth: 360, height: "auto" }}
      priority
    />
  );
}
