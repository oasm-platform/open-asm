import { ApiProperty } from '@nestjs/swagger';
import 'reflect-metadata';

export class SwaggerPropertyMetadata {
    @ApiProperty()
    value?: string | number | boolean;
    @ApiProperty()
    type?: string;
    @ApiProperty()
    example?: string | number | boolean;
    @ApiProperty()
    description?: string | number | boolean;
    @ApiProperty()
    title?: string;
}

export type SwaggerMetadataResponse<T> = {
    [K in keyof T]?: SwaggerPropertyMetadata;
};

export default function getSwaggerMetadata<T extends object>(target: new (...args: unknown[]) => T): SwaggerMetadataResponse<T> {
    const result: SwaggerMetadataResponse<T> = {};

    const instance = new target();

    for (const key of Object.keys(instance)) {
        const meta: unknown = Reflect.getMetadata('swagger/apiModelProperties', target.prototype, key);
        if (meta !== undefined) {
            const metaObj = meta as Record<string, unknown>;

            let typeName: string | undefined;
            if (metaObj.type) {
                if (typeof metaObj.type === 'function') {
                    typeName = typeof metaObj.type.name === 'string' ? metaObj.type.name.toLowerCase() : undefined;
                } else if (typeof metaObj.type === 'string') {
                    typeName = metaObj.type.toLowerCase();
                } else if (typeof metaObj.type === 'object' && metaObj.type !== null) {
                    const objType = metaObj.type as Record<string, unknown>;
                    typeName = typeof objType.name === 'string' ? objType.name.toLowerCase() : typeof metaObj.type;
                } else {
                    typeName = typeof metaObj.type === 'string' ? metaObj.type.toLowerCase() : undefined;
                }
            }

            (result as Record<string, SwaggerPropertyMetadata>)[key] = {
                type: typeName,
                title: (typeof metaObj.title === 'string' || typeof metaObj.title === 'number' || typeof metaObj.title === 'boolean') ? String(metaObj.title) : undefined,
                example: (typeof metaObj.example === 'string' || typeof metaObj.example === 'number' || typeof metaObj.example === 'boolean') ? metaObj.example : undefined,
                description: (typeof metaObj.description === 'string' || typeof metaObj.description === 'number' || typeof metaObj.description === 'boolean') ? metaObj.description : undefined
            };
        }
    }

    return result;
}
