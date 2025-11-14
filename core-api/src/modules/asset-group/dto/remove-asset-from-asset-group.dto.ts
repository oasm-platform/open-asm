import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class RemoveAssetFromAssetGroupDto {
	@ApiProperty({
		description: "ID of the asset group",
		example: "123e4567-e89b-12d3-a456-42614174000",
	})
	@IsUUID()
	assetGroupId: string;

	@ApiProperty({
		description: "ID of the asset to remove",
		example: "123e4567-e89b-12d3-a456-42614174001",
	})
	@IsUUID()
	assetId: string;
}
