import { isElderlyMode } from "@/lib/elderlyMode";
import { T } from "@/components/T";

export default async function LoginPage(
  props: {
    searchParams: Promise<{ error?: string; redirectTo?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const redirectTo = searchParams.redirectTo ?? "/review";
  const elderly = await isElderlyMode();

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        action="/api/login"
        method="POST"
        className="w-full max-w-sm rounded border p-6 shadow-sm"
      >
        <h1 className="mb-4 text-xl font-semibold">Flower Man</h1>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <label className="mb-1 block text-sm text-gray-600" htmlFor="password">
          <T k="password" elderly={elderly} />
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          className="mb-3 w-full rounded border px-3 py-2"
        />
        {searchParams.error && (
          <p className="mb-3 text-sm text-red-700">
            <T k="incorrectPassword" elderly={elderly} />
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded bg-gray-900 px-4 py-2 text-sm text-white"
        >
          <T k="logIn" elderly={elderly} />
        </button>
      </form>
    </main>
  );
}
