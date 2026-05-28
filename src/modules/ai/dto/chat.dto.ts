import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString() @MinLength(1) @MaxLength(2000) content!: string;
}

export class ChatRequestDto {
  @IsString() @MinLength(1) @MaxLength(500) message!: string;

  /**
   * The recent message history (most recent last). Capped at 20 turns
   * so the request body stays bounded — the assistant is intentionally
   * stateless on the server today, and the client owns the transcript.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
