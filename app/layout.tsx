import type { Metadata } from "next";
import "./globals.css";
import { UploadQueueProvider } from "@/components/upload/UploadQueueProvider";
import { isElderlyMode } from "@/lib/elderlyMode";

export const metadata: Metadata = {
  title: "Flower Man",
  description: "Invoice extraction and review",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const elderly = await isElderlyMode();
  return (
    <html lang="en" className={elderly ? "elderly" : undefined}>
      <body className="bg-gray-50 text-gray-900">
        <UploadQueueProvider>{children}</UploadQueueProvider>
      </body>
    </html>
  );
}
