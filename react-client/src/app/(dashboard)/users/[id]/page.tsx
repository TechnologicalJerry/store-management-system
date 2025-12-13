export default function UserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <div>User Detail Page - ID: {params.id}</div>;
}

