export class Reflector {
  getAllAndOverride<T = any>(_key: any, _targets: any[]): T | undefined {
    return undefined;
  }
}

export class NestFactory {
  static create(..._args: any[]) {
    return {
      getHttpAdapter: () => ({ getInstance: () => ({ set: () => {} }) }),
      enableCors: () => {},
      use: () => {},
      setGlobalPrefix: () => {},
      useGlobalPipes: () => {},
      listen: () => Promise.resolve(),
    };
  }
}
