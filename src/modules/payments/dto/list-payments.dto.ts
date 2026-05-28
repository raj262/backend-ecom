import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { PaymentStatus } from '../schemas/payment.schema';

export class ListPaymentsDto extends PaginationDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
}
