import AcceptInvite from "@/components/accept-invite";
export const metadata = { referrer: "no-referrer" as const };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <AcceptInvite token={token || ""} />;
}
