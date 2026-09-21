import { T } from "@/components/T";

export function LogoutButton({ elderly = false }: { elderly?: boolean }) {
  return (
    <form action="/api/logout" method="POST">
      <button
        type="submit"
        className={elderly ? "text-gray-600 underline" : "text-sm text-gray-500 underline"}
      >
        <T k="logout" elderly={elderly} />
      </button>
    </form>
  );
}
