import type { Offer, Product, Shop } from './types';

export const IMG_PREFIX = 'https://image.torob.com/base/images/';

export type ShopRow = {
  rid: number;
  id: string;
  name: string;
  address: string;
  location_label: string;
  lat: number;
  lon: number;
  complex_id: string | null;
  complex_name: string | null;
  floor: number | null;
  unit: string | null;
  parse_confidence: 'high' | 'medium' | 'low';
  installment: number;
  torob_pay: number;
  providers_json: string;
  hours_json: string | null;
  phone: string | null;
  categories_json: string;
};

export function shopFromRow(r: ShopRow): Shop {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    locationLabel: r.location_label,
    lat: r.lat,
    lon: r.lon,
    ...(r.complex_id && r.complex_name ? { complex: { id: r.complex_id, name: r.complex_name } } : {}),
    floor: r.floor,
    unit: r.unit,
    parseConfidence: r.parse_confidence,
    hours: r.hours_json ? JSON.parse(r.hours_json) : null,
    providers: JSON.parse(r.providers_json || '[]'),
    installment: !!r.installment,
    torobPay: !!r.torob_pay,
    ...(r.phone ? { phone: r.phone } : {}),
    categories: JSON.parse(r.categories_json || '[]').slice(0, 8),
  };
}

export type ProductRow = {
  rid: number;
  id: string;
  title: string;
  brand: string | null;
  category: string;
  images_json: string;
  key_specs_json: string;
  min_price: number;
  max_price: number;
  shop_count: number;
  fresh_share: number;
};

export function productFromRow(r: ProductRow): Product {
  const imgs: string[] = JSON.parse(r.images_json || '[]');
  return {
    id: r.id,
    title: r.title,
    brand: r.brand,
    category: r.category,
    images: imgs.map((u) => (u.startsWith('http') ? u : IMG_PREFIX + u)),
    keySpecs: JSON.parse(r.key_specs_json || '[]'),
    minPrice: r.min_price,
    maxPrice: r.max_price,
    shopCount: r.shop_count,
    freshShare: Math.round(r.fresh_share * 100) / 100,
  };
}

export type OfferRow = {
  rid: number;
  product_id: string;
  shop_id: string;
  price: number;
  last_changed_at: string;
  seller_title: string;
  warranty: string | null;
  description: string | null;
};

export function offerFromRow(r: OfferRow): Offer {
  return {
    id: `of_${r.rid}`,
    productId: r.product_id,
    shopId: r.shop_id,
    price: r.price,
    lastChangedAt: r.last_changed_at,
    sellerTitle: r.seller_title,
    warranty: r.warranty,
    description: r.description,
  };
}
