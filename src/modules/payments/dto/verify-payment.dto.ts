import { IsString, Length, Validate, ValidationArguments } from 'class-validator';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Gateway callbacks ship a dynamic, gateway-specific map (Razorpay's
 * `razorpay_payment_id`, Easebuzz's `txnid` + `udfN` etc.). We can't list
 * every field, but we MUST refuse anything that isn't a shallow
 * string→string object — otherwise an attacker could ship nested objects
 * to confuse the HMAC verifier.
 */
@ValidatorConstraint({ name: 'isStringMap', async: false })
class IsStringMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (typeof v !== 'string') return false;
    }
    return true;
  }
  defaultMessage(_args: ValidationArguments) {
    return 'fields must be a flat object of string → string';
  }
}

export class VerifyPaymentDto {
  @IsString() @Length(8, 256) signature!: string;
  @Validate(IsStringMapConstraint) fields!: Record<string, string>;
}
