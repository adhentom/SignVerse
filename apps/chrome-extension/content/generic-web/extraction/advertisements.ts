const AD_ATTRIBUTE_SELECTOR = [
  '[role="advertisement"]',
  '[aria-label*="advertisement" i]',
  '[aria-label*="sponsored" i]',
  '[data-ad]',
  '[data-ad-slot]',
  '[data-ad-unit]',
  'ins.adsbygoogle',
].join(',');

const AD_TOKEN = /(^|[-_])(ad|ads|advert|advertisement|sponsor|sponsored)([-_]|$)/i;

function hasAdvertisingToken(element: Element): boolean {
  if (AD_TOKEN.test(element.id)) {
    return true;
  }

  return Array.from(element.classList).some((className) => AD_TOKEN.test(className));
}

export function isInsideAdvertisement(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.matches(AD_ATTRIBUTE_SELECTOR) || hasAdvertisingToken(current)) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}
