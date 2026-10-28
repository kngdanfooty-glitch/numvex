/*
 * The boost catalogue's shapes (platforms > categories > services). They live in @numvexs/shared, because the API
 * builds the catalogue from each SMM panel's service list and the pages only read it (see useBoostCatalog in hooks.ts).
 */
export type { PlatformId, SmmService, SmmCategory, SmmPlatform } from '@numvexs/shared';
