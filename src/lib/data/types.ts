export type DayKey = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export type DayHours = {
  status: 'declared' | 'closed' | 'unknown';
  /** "HH:MM" pairs; end "24:00" means midnight. */
  shifts: { start: string; end: string }[];
};

export type WeeklyHours = Partial<Record<DayKey, DayHours>>;

export type Shop = {
  id: string;
  name: string;
  address: string;
  locationLabel: string;
  lat: number;
  lon: number;
  complex?: { id: string; name: string };
  floor: number | null;
  unit: string | null;
  parseConfidence: 'high' | 'medium' | 'low';
  hours: WeeklyHours | null;
  providers: string[];
  installment: boolean;
  torobPay: boolean;
  phone?: string;
  categories: string[];
};

export type KeySpec = { key: string; value: string };

export type Product = {
  id: string;
  title: string;
  brand: string | null;
  category: string;
  images: string[];
  keySpecs: KeySpec[];
  minPrice: number;
  maxPrice: number;
  shopCount: number;
  freshShare: number;
  /** share of offers updated in the last 30 days */
  freshShare30?: number;
};

export type Offer = {
  id: string;
  productId: string;
  shopId: string;
  price: number;
  lastChangedAt: string;
  sellerTitle: string;
  warranty: string | null;
  description: string | null;
};

export type OfferWithShop = Offer & { shop: Shop };

export type Complex = {
  id: string;
  name: string;
  centroidLat: number;
  centroidLon: number;
  shopCount: number;
};

export type Area = {
  locationLabel: string;
  centroidLat: number;
  centroidLon: number;
  shopCount: number;
};

export type SearchQuery = {
  text: string;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  category?: string;
  limit?: number;
};

export type ComplexResult = { complex: Complex; shops: Shop[]; offerShopIds: string[] };

export interface DataSource {
  kind: 'fixtures' | 'sqlite';
  searchProducts(q: SearchQuery): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  getProducts(ids: string[]): Promise<Product[]>;
  getOffers(productId: string): Promise<OfferWithShop[]>;
  getShop(id: string): Promise<Shop | null>;
  getComplex(id: string, productId?: string): Promise<ComplexResult | null>;
  listAreas(): Promise<Area[]>;
  counts(): Promise<{ shops: number; products: number; offers: number }>;
}
