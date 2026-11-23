import { EquipmentIcon } from "./EquipmentIcon";

type Item = { name: string; type: string; photoUrl: string | null };

/**
 * The item's photo when it has one (from the inventory sheet or added by an admin), otherwise the
 * drawn icon for its type, in the same frame so layouts don't jump.
 * - `cover`: fills a 4:3 frame (board cards, item page).
 * - `thumb`: a small square for lists; `size` sets it (default size-12).
 * Tall phone photos are cropped towards the top, where the robots' heads are.
 * Next to the item's name the photo adds nothing for screen readers, so it is decorative unless
 * `decorative={false}` (the item page's main photo).
 */
export function EquipmentImage({
  item,
  variant = "thumb",
  size = "size-12",
  decorative = true,
}: {
  item: Item;
  variant?: "thumb" | "cover";
  size?: string;
  decorative?: boolean;
}) {
  const frame = variant === "cover" ? "block aspect-[4/3] w-full" : `${size} shrink-0`;
  if (item.photoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local photos are pre-sized; admins may also link any host
      <img
        src={item.photoUrl}
        alt={decorative ? "" : `Photo of ${item.name}`}
        loading={decorative ? "lazy" : "eager"} // the item page's main photo is above the fold
        decoding="async"
        className={`${frame} bg-paper-3 object-cover ${variant === "thumb" ? "border border-rule" : "object-[center_20%]"}`}
      />
    );
  return (
    <span className={`${frame} flex items-center justify-center bg-rgu-panel/40`} aria-hidden="true">
      <EquipmentIcon type={item.type} className={variant === "cover" ? "size-20 text-rgu-purple" : "size-3/4 text-rgu-purple"} />
    </span>
  );
}
