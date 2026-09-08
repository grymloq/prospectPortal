import Link from "next/link";
export default function AuthError() {
  return (
    <main className="auth-form" style={{ minHeight: "100vh" }}>
      <div className="auth-inner">
        <h1>This link could not be verified</h1>
        <p>
          Open the latest email link in the same browser where you requested it.
          You can also sign in if you have already confirmed your email.
        </p>
        <Link href="/">Back to sign in</Link>
        <p>
          <Link href="/forgot-password">Request a password reset</Link>
        </p>
      </div>
    </main>
  );
}
