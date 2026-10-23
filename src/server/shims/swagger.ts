export const ApiProperty =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export const ApiPropertyOptional =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export const ApiTags =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export const ApiOperation =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export const ApiResponse =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export const ApiBearerAuth =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export const ApiHeader =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export const ApiQuery =
  (..._args: any[]) =>
  (_target: any, _propertyKey?: any, _descriptor?: any): any => {};

export class DocumentBuilder {
  setTitle() { return this; }
  setDescription() { return this; }
  setVersion() { return this; }
  addBearerAuth() { return this; }
  build() { return {}; }
}

export const SwaggerModule = {
  createDocument: () => ({}),
  setup: () => {},
};
