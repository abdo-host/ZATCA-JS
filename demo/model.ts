export type Profile = 'standard' | 'simplified';
export type Scenario = 'accepted' | 'warning' | 'rejected' | 'timeout';

export const route = {
  standard: {
    label: 'التخليص',
    path: '/invoices/clearance/single',
    success: 'CLEARED',
  },
  simplified: {
    label: 'الإبلاغ',
    path: '/invoices/reporting/single',
    success: 'REPORTED',
  },
} as const;

export function simulateSubmission(profile: Profile, scenario: Scenario) {
  const success = route[profile].success;
  switch (scenario) {
    case 'accepted':
      return {
        tone: 'good',
        title: 'قبول في المحاكاة',
        detail: `HTTP 200 · ${success}`,
      };
    case 'warning':
      return {
        tone: 'caution',
        title: 'قبول مع تحذير في المحاكاة',
        detail: `HTTP 202 · ${success}`,
      };
    case 'rejected':
      return {
        tone: 'danger',
        title: 'رفض في المحاكاة',
        detail: `HTTP 400 · NOT_${success}`,
      };
    case 'timeout':
      return {
        tone: 'caution',
        title: 'نتيجة غير مؤكدة',
        detail: 'راجع حالة الطلب قبل إعادة الإرسال.',
      };
  }
}
