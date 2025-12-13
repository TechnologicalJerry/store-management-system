export default function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <div>Order Detail Page - ID: {params.id}</div>;
}

