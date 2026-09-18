import { NavBar } from "@/components/NavBar";
import { UploadForm } from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <NavBar />
      <h1 className="mb-4 text-2xl font-semibold">Upload Invoices</h1>
      <p className="mb-6 text-sm text-gray-500">
        Select one or more invoice images or multi-page PDFs (one invoice per page)
        — each is split and processed automatically. Files upload one at a time;
        add as many as you like and they&apos;ll queue up.
      </p>
      <UploadForm />
    </main>
  );
}
