export default function ResetPasswordPage({
  params,
}: {
  params: { token: string };
}) {
  return <div>Reset Password Page - Token: {params.token}</div>;
}

