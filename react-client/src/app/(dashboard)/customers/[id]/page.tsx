export default function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <div>Customer Detail Page - ID: {params.id}</div>;
}

