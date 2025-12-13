export default function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  return <div>Edit Product Page - ID: {params.id}</div>;
}

