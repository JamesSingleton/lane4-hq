import { redirect } from "next/navigation";

export default function BetaPage() {
  const ops = (process.env.OPS_URL ?? "http://localhost:3005").replace(
    /\/$/,
    "",
  );
  redirect(ops);
}
