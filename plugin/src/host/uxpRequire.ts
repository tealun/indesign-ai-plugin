/** UXP runtime modules — marked external in esbuild. */

export type IndesignModule = {
  app: any;
  ExportFormat?: any;
  PNGQualityEnum?: any;
  PNGColorSpaceEnum?: any;
  NothingEnum?: any;
};

export type UxpModule = {
  storage: {
    localFileSystem: {
      getTemporaryFolder: () => Promise<any>;
      formats?: { binary?: any; utf8?: any };
    };
    formats: { binary: any; utf8: any };
  };
};

declare const require: (id: string) => unknown;

export function tryRequireIndesign(): IndesignModule | null {
  try {
    return require("indesign") as IndesignModule;
  } catch {
    return null;
  }
}

export function tryRequireUxp(): UxpModule | null {
  try {
    return require("uxp") as UxpModule;
  } catch {
    return null;
  }
}

export function isInDesignRuntime(): boolean {
  return tryRequireIndesign()?.app != null;
}
