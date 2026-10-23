export type InquiryStatus = 'sent' | 'seen' | 'replied';
export type InquiryOutcome = 'confirm' | 'new_price' | 'out_of_stock';

export type Inquiry = {
  id: string;
  shopId: string;
  productId: string;
  offerPrice: number;
  status: InquiryStatus;
  outcome: InquiryOutcome | null;
  newPrice: number | null;
  question: string | null;
  answer: string | null;
  createdAt: number;
  seenAt: number | null;
  repliedAt: number | null;
  autoReplyDueAt: number | null;
};

/** What the user's client sees (timeout is derived). */
export type InquiryDTO = Omit<Inquiry, 'status'> & { status: InquiryStatus | 'timeout' };

export type ShopOverride = { shopId: string; closedToday: boolean; hoursToday: { start: string; end: string }[] | null; dateKey: string };
