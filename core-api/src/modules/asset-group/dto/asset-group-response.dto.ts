import { ApiProperty } from "@nestjs/swagger";
import { Asset } from "../../assets/entities/assets.entity";
import { Tool } from "../../tools/entities/tools.entity";

export class AssetGroupResponseDto {
	@ApiProperty({
		description: "ID of the asset group",
		example: "123e4567-e89b-12d3-a456-426614174000",
	})
	id: string;

	@ApiProperty({
		description: "Name of the asset group",
		example: "Web Servers",
	})
	name: string;

	@ApiProperty({
		description: "Date when the asset group was created",
		example: "2023-01-01T00:00.000Z",
	})
	createdAt: Date;

	@ApiProperty({
		description: "Date when the asset group was last updated",
		example: "2023-01-01T00:00:00.000Z",
	})
	updatedAt: Date;

	@ApiProperty({
		description: "List of assets in the asset group",
		type: [Asset],
		required: false,
	})
	assets?: Asset[];

	@ApiProperty({
		description: "List of tools in the asset group",
		type: [Tool],
		required: false,
	})
	tools?: Tool[];
}
