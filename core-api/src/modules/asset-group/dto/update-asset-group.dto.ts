import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateAssetGroupDto {
	@ApiProperty({
		description: "Name of the asset group",
		example: "Web Servers",
		required: false,
	})
	@IsOptional()
	@IsString()
	name?: string;
}
