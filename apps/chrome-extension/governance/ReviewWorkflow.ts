import type {
  GovernedVocabularyRecord,
  HumanReview,
  ReviewPolicy,
} from './types';

export const DEFAULT_REVIEW_POLICY: ReviewPolicy = Object.freeze({
  requiredApprovals: Object.freeze({
    'native-isl': 1,
    linguist: 1,
    licensing: 1,
  }),
});

export class ReviewWorkflow {
  constructor(private readonly policy: ReviewPolicy = DEFAULT_REVIEW_POLICY) {}

  submit(record: GovernedVocabularyRecord): GovernedVocabularyRecord {
    if (record.reviewStatus !== 'draft') {
      throw new Error(`Only draft entries can enter review: ${record.entry.tokenId}.`);
    }
    return Object.freeze({ ...record, reviewStatus: 'in-review' });
  }

  record(
    record: GovernedVocabularyRecord,
    review: HumanReview,
  ): GovernedVocabularyRecord {
    if (record.reviewStatus !== 'in-review') {
      throw new Error(`Entry is not in review: ${record.entry.tokenId}.`);
    }
    if (!review.reviewerId.trim() || !review.reviewedAt.trim() || !review.notes.trim()) {
      throw new Error('Review records require reviewer, date, and notes.');
    }
    const reviews = Object.freeze([...record.reviews, Object.freeze({ ...review })]);
    const rejected = reviews.some(({ decision }) => decision === 'reject');
    const approved = !rejected && this.hasRequiredApprovals(reviews);
    if (approved && (!record.provenance.source || !record.provenance.license)) {
      throw new Error(`Source and license are required for approval: ${record.entry.tokenId}.`);
    }
    return Object.freeze({
      ...record,
      reviews,
      reviewStatus: rejected ? 'rejected' : approved ? 'approved' : 'in-review',
    });
  }

  private hasRequiredApprovals(reviews: readonly HumanReview[]): boolean {
    return Object.entries(this.policy.requiredApprovals).every(([role, count]) => (
      reviews.filter((review) => review.role === role && review.decision === 'approve').length >= count
    ));
  }
}
