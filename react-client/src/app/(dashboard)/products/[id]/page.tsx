export default function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <div>Product Detail Page - ID: {params.id}</div>;
}

