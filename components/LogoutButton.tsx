export function LogoutButton() {
  return (
    <form action="/api/logout" method="POST">
      <button type="submit" className="text-sm text-gray-500 underline">
        Log out
      </button>
    </form>
  );
}
