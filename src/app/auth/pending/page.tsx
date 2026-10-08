import Link from "next/link";

export default function PendingMembership() {
  return (
    <main className="auth-form" style={{ minHeight: "100vh" }}>
      <div className="auth-inner">
        <h1>Waiting for team confirmation</h1>
        <p>
          Your account is registered. A team administrator needs to confirm your
          membership before you can sign in.
        </p>
        <p>Email verification and team membership are separate steps.</p>
        <Link href="/">Back to sign in</Link>
      </div>
    </main>
  );
}
