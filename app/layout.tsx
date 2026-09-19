import type { Metadata } from "next";
import "./globals.css";
import { UploadQueueProvider } from "@/components/upload/UploadQueueProvider";

export const metadata: Metadata = {
  title: "Flower Man",
  description: "Invoice extraction and review",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <UploadQueueProvider>{children}</UploadQueueProvider>
      </body>
    </html>
  );
}
