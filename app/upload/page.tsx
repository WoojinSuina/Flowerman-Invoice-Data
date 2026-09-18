import { NavBar } from "@/components/NavBar";
import { UploadForm } from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Upload Invoices</h1>
      <p className="mb-6 text-sm text-gray-500">
        Upload a single invoice image, or a multi-page PDF (one invoice per page)
        — it will be split and processed automatically.
      </p>
      <UploadForm />
    </main>
  );
}
