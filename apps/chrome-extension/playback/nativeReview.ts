import reviewOverrides from './nativeReviewRegistry.json';
import type { NativeISLReview, SignAsset } from './types';

const PENDING_REVIEW: NativeISLReview = {
  status: 'pending',
  reviewer: '',
  reviewed_at: '',
  notes: 'Native ISL linguistic review has not been recorded.',
};

const REVIEWS = reviewOverrides as Record<string, NativeISLReview>;

export function nativeReviewFor(assetId: string): NativeISLReview {
  return REVIEWS[assetId] ?? { ...PENDING_REVIEW };
}

export function isNativeApproved(asset: SignAsset): boolean {
  const review = asset.native_review;
  return review?.status === 'approved'
    && review.reviewer.trim().length > 0
    && review.reviewed_at.trim().length > 0;
}
