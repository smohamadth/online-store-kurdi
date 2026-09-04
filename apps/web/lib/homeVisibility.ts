/**
 * Home builder `isVisible` is the only visibility switch on the live home page.
 * Legacy theme.show* tokens used to hide sections even after the builder
 * turned them on.
 */
export function isHomeSectionVisible(section: { isVisible: boolean }): boolean {
  return section.isVisible === true;
}
