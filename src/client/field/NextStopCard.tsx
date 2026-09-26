/**
 * The next stop — docs/design.md, "Next-stop card". Nearest-next ordering
 * means the first item in the round is not a row, it is an instruction: the
 * only stop set apart by a card, a gold edge and carrying its own actions.
 */
import { NotSyncedBadge, StopActions, Distance } from "./StopRow";
import { StopNumber } from "./StopNumber";
import { copy, TYPE_LABELS } from "../copy";
import type { TodayItem } from "./today";

export function NextStopCard({ item }: { item: TodayItem }) {
  return (
    <article className="bg-card border-border shadow-[inset_4px_0_0_0_var(--color-primary)] rounded-xl border p-4">
      <p className="text-overline text-muted-foreground uppercase">{copy.today.nextStop}</p>

      <div className="mt-2 flex items-start gap-3">
        <StopNumber index={1} variant="next" />
        <div className="min-w-0 flex-1">
          {/* docs/design.md type table: Heading is "the next stop's name on a
              phone" — an `<h3>` so screen-reader heading navigation finds it,
              same as the screen it replaced. */}
          <h3 className="text-heading break-words">{item.name}</h3>
          <p className="text-muted-foreground text-meta break-words">
            {copy.today.meta(TYPE_LABELS[item.type], item.address)}
          </p>
          <NotSyncedBadge item={item} />
        </div>
        <p className="shrink-0">
          <Distance item={item} className="text-base font-semibold" />
        </p>
      </div>

      <div className="mt-3.5">
        <StopActions item={item} />
      </div>
    </article>
  );
}
