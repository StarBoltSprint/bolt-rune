import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function HallMark() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-8 w-[4.5rem] animate-pulse rounded-full bg-white/10" aria-hidden />;
  }
  if (user) {
    return (
      <div className="hall-mark max-w-[11rem] [&_button]:font-mono [&_button]:text-[10px] [&_button]:uppercase [&_button]:tracking-[0.18em] [&_button]:text-white/50 [&_div]:gap-1.5 [&_img]:h-6 [&_img]:w-6 [&_span]:truncate [&_span]:font-mono [&_span]:text-[10px] [&_span]:uppercase [&_span]:tracking-[0.16em] [&_span]:text-white/70">
        <UserButton />
      </div>
    );
  }
  return (
    <a
      href="/login"
      className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#f0d48a]"
      style={{ touchAction: "manipulation" }}
    >
      Keep
    </a>
  );
}
