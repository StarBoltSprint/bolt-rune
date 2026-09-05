import { createFileRoute } from "@tanstack/react-router";
import { CineApp } from "@/components/cine-app";

export const Route = createFileRoute("/artifacts")({
  validateSearch: (s: Record<string, unknown>) => ({
    art: typeof s.art === "string" && s.art ? s.art : undefined,
  }),
  component: ArtifactsPage,
});

function ArtifactsPage() {
  const { art } = Route.useSearch();
  return <CineApp bootScreen="cook" playArt={art} />;
}
