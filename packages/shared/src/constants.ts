export const PRODUCT_KINDS = ['number', 'boost'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];
