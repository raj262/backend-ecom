import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  list() {
    return this.categoryModel
      .find({ active: true })
      .sort({ order: 1, name: 1 })
      .exec();
  }

  async findBySlug(slug: string) {
    const cat = await this.categoryModel
      .findOne({ slug, active: true })
      .exec();
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  create(dto: CreateCategoryDto) {
    return this.categoryModel.create({
      ...dto,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : null,
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const patch: Record<string, unknown> = { ...dto };
    if (dto.parentId !== undefined) {
      patch.parentId = dto.parentId ? new Types.ObjectId(dto.parentId) : null;
    }
    const cat = await this.categoryModel
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .exec();
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async remove(id: string) {
    await this.update(id, { active: false });
    return { ok: true };
  }
}
