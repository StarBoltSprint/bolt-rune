import { createFileRoute } from "@tanstack/react-router";
import { VaultHall } from "@/components/vault-hall";

export const Route = createFileRoute("/vault")({
  component: VaultPage,
});

function VaultPage() {
  return <VaultHall />;
}
