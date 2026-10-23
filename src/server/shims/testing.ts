export class Test {
  static createTestingModule(metadata: { controllers?: any[]; providers?: any[] } = {}) {
    const instances = new Map<any, any>();
    const providers = metadata.providers || [];
    for (const p of providers) {
      const cls = typeof p === 'function' ? p : p?.provide;
      if (typeof cls === 'function') {
        instances.set(cls, new cls());
      }
    }
    const controllers = metadata.controllers || [];
    for (const c of controllers) {
      if (typeof c === 'function') {
        const providerInstances = providers.map((p) => {
          const cls = typeof p === 'function' ? p : p?.provide;
          return instances.get(cls);
        }).filter(Boolean);
        instances.set(c, new c(...providerInstances));
      }
    }

    return {
      compile: async () => ({
        get: (type: any) => instances.get(type) || (typeof type === 'function' ? new type() : undefined),
      }),
    };
  }
}

export type TestingModule = any;
