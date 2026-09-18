import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Flower Man</h1>
      <Link href="/review" className="text-blue-600 underline hover:text-blue-800">
        Go to invoice review
      </Link>
    </main>
  );
}
