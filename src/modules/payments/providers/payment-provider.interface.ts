/**
 * Contract every gateway integration implements. Keeps the rest of the
 * payments module gateway-agnostic — adding a new provider means dropping
 * in a new class behind this interface.
 */
export interface PaymentInitRequest {
  amount: number;
  currency: string;
  orderId: string;
  customer: { email?: string; phone?: string; name?: string };
}

export interface PaymentInitResponse {
  /** Provider's own order/intent id, returned to the client. */
  providerRef: string;
  /** Arbitrary blob the client SDK needs to open the checkout. */
  clientPayload: Record<string, unknown>;
}

export interface PaymentVerifyRequest {
  orderId: string;
  providerRef: string;
  signature: string;
  /** Raw fields used by the gateway's HMAC. Shape differs per provider. */
  fields: Record<string, string>;
}

export interface PaymentProviderAdapter {
  readonly name: string;
  init(req: PaymentInitRequest): Promise<PaymentInitResponse>;
  verify(req: PaymentVerifyRequest): Promise<boolean>;
}
