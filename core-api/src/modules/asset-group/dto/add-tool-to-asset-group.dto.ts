import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class AddToolToAssetGroupDto {
	@ApiProperty({
		description: "ID of the asset group",
		example: "123e4567-e89b-12d3-a456-42614174000",
	})
	@IsUUID()
	assetGroupId: string;

	@ApiProperty({
		description: "ID of the tool to add",
		example: "123e4567-e89b-12d3-a456-42614174001",
	})
	@IsUUID()
	toolId: string;
}
