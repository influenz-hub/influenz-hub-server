export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * Appends -2, -3, ... until `exists` reports the slug free. Callers pass a
 * model-specific lookup so this stays independent of any one Prisma model.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
) {
  const root = slugify(base) || "item";
  let slug = root;
  let n = 1;
  while (await exists(slug)) {
    slug = `${root}-${++n}`;
  }
  return slug;
}
