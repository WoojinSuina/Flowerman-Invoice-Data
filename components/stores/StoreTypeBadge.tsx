export function StoreTypeBadge({ consignment }: { consignment: boolean }) {
  const style = consignment ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {consignment ? "Consignment" : "Regular"}
    </span>
  );
}
