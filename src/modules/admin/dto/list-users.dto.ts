import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { UserRole } from '../../../common/types/user-role.enum';

export class ListUsersDto extends PaginationDto {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() q?: string;
}
