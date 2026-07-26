import { ScanStatusClient } from "./ScanStatusClient";

export const dynamic = "force-dynamic";

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  return <ScanStatusClient scanId={id} token={token ?? ""} />;
}
