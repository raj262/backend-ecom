import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Validates that a route param is a well-formed Mongo ObjectId before any
 * controller code runs. Use as `@Param('id', ParseObjectIdPipe) id: string`.
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid id: "${value}"`);
    }
    return value;
  }
}
