import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import { Column, Entity, ManyToOne } from 'typeorm';


class McpPermissionValue {
    @ApiProperty()
    @IsString()
    workspaceId: string;

    @ApiProperty({ example: ['get_assets'] })
    @IsString({ each: true })
    permissions: string[];
}

@Entity('mcp_permissions')
export class McpPermission extends BaseEntity {
    @ApiProperty({ example: 'MCP Permission' })
    @Column({ default: 'Unnamed' })
    @IsString()
    name: string;
    @ApiProperty({ example: 'Allows access to assets in the workspaces', required: false })
    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    description: string;
    @Column({ type: 'json' })
    @ApiProperty({ isArray: true })
    @IsArray()
    value: McpPermissionValue[];
    @ManyToOne(() => User)
    owner: User;
}

