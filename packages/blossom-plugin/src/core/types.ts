export type BlossomTag = [string, string];

export type NostrSignerLike = unknown;

export interface BlossomUploadClientOptions {
  servers: string[];
  signer: NostrSignerLike;
  expiresIn?: number;
}

export interface BlossomUploadResult {
  tags: BlossomTag[];
  url: string;
}
