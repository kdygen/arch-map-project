import { z } from "zod";

import { apiGet } from "./client";

const option = z.object({ slug: z.string(), name: z.string(), count: z.number().int() });
const valueOption = z.object({ value: z.string(), count: z.number().int() });

const filterOptionsSchema = z.object({
  architects: z.array(option),
  styles: z.array(option),
  periods: z.array(
    option.extend({ start_year: z.number().nullable(), end_year: z.number().nullable() }),
  ),
  building_types: z.array(option),
  tag_categories: z.array(z.object({ category: z.string(), tags: z.array(option) })),
  public_access: z.array(valueOption),
  admission_types: z.array(valueOption),
  year_built: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
});

export type FilterOptions = z.infer<typeof filterOptionsSchema>;
export type FilterOption = z.infer<typeof option>;

export function getFilterOptions(signal?: AbortSignal): Promise<FilterOptions> {
  return apiGet("/filters", { schema: filterOptionsSchema, signal });
}
