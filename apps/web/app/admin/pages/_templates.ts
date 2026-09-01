/**
 * Page templates shared between the admin pages list and the
 * "New page" form. Lives in a private (underscore) module so
 * Next.js does not validate it as a page export.
 */
/** Templates exposed on the "New page" page; kept here so the
 *  index can advertise them in a tooltip without an extra round
 *  trip. */
export const PAGE_TEMPLATES: {
  name: string;
  title: string;
  slug: string;
  pageType: 'info' | 'legal' | 'help';
  content: string;
}[] = [
  {
    name: 'About us',
    title: 'About Us',
    slug: 'about-us',
    pageType: 'info',
    content:
      '<h2>Who we are</h2><p>Tell customers who runs the shop and why it exists.</p>' +
      '<h2>What we sell</h2><p>Describe your range and what makes it worth buying.</p>' +
      '<h2>Where to find us</h2><p>Address, opening hours, and how to get in touch.</p>',
  },
  {
    name: 'Shipping policy',
    title: 'Shipping Policy',
    slug: 'shipping-policy',
    pageType: 'help',
    content:
      '<h2>Delivery times</h2><p>How long orders take, by area.</p>' +
      '<h2>Delivery charges</h2><p>What shipping costs and when it is free.</p>' +
      '<h2>Tracking</h2><p>How customers follow their order.</p>',
  },
  {
    name: 'Refund policy',
    title: 'Refund Policy',
    slug: 'refund-policy',
    pageType: 'legal',
    content:
      '<h2>Returns window</h2><p>How many days a customer has to return an item.</p>' +
      '<h2>Condition</h2><p>What state goods must be in to qualify.</p>' +
      '<h2>How to start a return</h2><p>The steps a customer should follow.</p>',
  },
];
