export default function RoleGuard({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole: string;
}) {
  return <>{children}</>;
}

