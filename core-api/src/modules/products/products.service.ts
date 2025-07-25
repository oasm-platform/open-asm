import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { WorkspaceProduct } from './entities/workspace-product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { AddProductToWorkspaceDto } from './dto/add-product-to-workspace.dto';
import { Workspace } from '../workspaces/entities/workspace.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(WorkspaceProduct)
    private readonly workspaceProductRepository: Repository<WorkspaceProduct>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const product = this.productRepository.create(createProductDto);
    return this.productRepository.save(product);
  }

  async addProductToWorkspace(addProductToWorkspaceDto: AddProductToWorkspaceDto): Promise<WorkspaceProduct> {
    const { productId, workspaceId } = addProductToWorkspaceDto;

    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${workspaceId}" not found`);
    }

    const workspaceProduct = this.workspaceProductRepository.create({
      product,
      workspace,
    });

    return this.workspaceProductRepository.save(workspaceProduct);
  }

  findAll(): Promise<Product[]> {
    return this.productRepository.find();
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }
    return product;
  }
}
