/** Shared floating-point tolerance for comparing coin, ton and hectare amounts
 * derived from each other, so affordability, allocation bounds, save
 * validation and carried plans agree at the boundary. Far below anything the
 * player can see, far above accumulated rounding noise. */
export const TOLERANCE = 1e-6;
