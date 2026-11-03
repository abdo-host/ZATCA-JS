/** A machine-readable problem found while validating an input. */
export interface ZatcaIssue {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly path?: string;
  readonly specReference?: string;
}

/** Base error for SDK operations with a stable diagnostic code. */
export class ZatcaError extends Error {
  override name = 'ZatcaError';

  constructor(
    message: string,
    readonly code = 'ZATCA_ERROR',
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Input failed one or more validation rules. */
export class ZatcaValidationError extends ZatcaError {
  override name = 'ZatcaValidationError';

  constructor(
    message: string,
    readonly issues: readonly ZatcaIssue[] = [],
    options?: ErrorOptions,
  ) {
    super(message, 'ZATCA_VALIDATION_ERROR', options);
  }
}

/** Data cannot be encoded or decoded in the expected representation. */
export class ZatcaEncodingError extends ZatcaError {
  override name = 'ZatcaEncodingError';

  constructor(
    message: string,
    code = 'ZATCA_ENCODING_ERROR',
    options?: ErrorOptions,
  ) {
    super(message, code, options);
  }
}

/** A compliance check could not be completed successfully. */
export class ZatcaComplianceError extends ZatcaError {
  override name = 'ZatcaComplianceError';

  constructor(
    message: string,
    code = 'ZATCA_COMPLIANCE_ERROR',
    options?: ErrorOptions,
  ) {
    super(message, code, options);
  }
}

/** A ZATCA API operation failed. */
export class ZatcaApiError extends ZatcaError {
  override name = 'ZatcaApiError';

  constructor(
    message: string,
    code = 'ZATCA_API_ERROR',
    options?: ErrorOptions,
  ) {
    super(message, code, options);
  }
}
