import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { AddProductToWorkspaceDto } from './dto/add-product-to-workspace.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Product } from './entities/product.entity';
import { WorkspaceProduct } from './entities/workspace-product.entity';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'The product has been successfully created.', type: Product })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Post('add-to-workspace')
  @ApiOperation({ summary: 'Add a product to a workspace' })
  @ApiResponse({ status: 201, description: 'The product has been successfully added to the workspace.', type: WorkspaceProduct })
  addProductToWorkspace(@Body() addProductToWorkspaceDto: AddProductToWorkspaceDto) {
    return this.productsService.addProductToWorkspace(addProductToWorkspaceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({ status: 200, description: 'Return all products.', type: [Product] })
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiResponse({ status: 200, description: 'Return a single product.', type: Product })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }
}
