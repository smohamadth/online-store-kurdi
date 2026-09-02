/**
 * Review-feature constants.
 *
 * Kept in their own file so the helpers (which use
 * `MAX_REVIEW_PHOTOS`) can be unit-tested without importing the
 * Express app.
 */

/**
 * Cap on the number of photos a single review can carry. Picked
 * to be generous enough for a real "look at the box from every
 * angle" review without letting the upload endpoint be abused as
 * free cloud storage.
 */
export const MAX_REVIEW_PHOTOS = 5;
