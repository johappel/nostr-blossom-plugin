export type BlossomTag = [string, string];

export interface BlossomSigner {
  getPublicKey: () => Promise<string>;
  signEvent: (event: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface BlossomUploadClientOptions {
  servers: string[];
  signer: BlossomSigner;
  expiresIn?: number;
  timeoutMs?: number;
}

export interface BlossomUploadResult {
  tags: BlossomTag[];
  url: string;
}
