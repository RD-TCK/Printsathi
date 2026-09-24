declare module "mammoth" {
  export interface MammothResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  export interface MammothOptions {
    buffer?: Buffer | Uint8Array | ArrayBuffer;
    path?: string;
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
  }

  export function convertToHtml(input: { buffer: Buffer | Uint8Array | ArrayBuffer } | { path: string }, options?: MammothOptions): Promise<MammothResult>;
  export function extractRawText(input: { buffer: Buffer | Uint8Array | ArrayBuffer } | { path: string }): Promise<MammothResult>;
}
