// Mock for @huggingface/transformers — avoids loading the real ESM-only package in Jest
export const env = {
  localModelPath: '',
  cacheDir: '',
  allowRemoteModels: true,
  allowLocalModels: true,
};

export class FeatureExtractionPipeline {
  async _call(
    input: string | string[],
    _opts?: Record<string, unknown>,
  ): Promise<{ data: Float32Array; dims: number[] }> {
    const count = Array.isArray(input) ? input.length : 1;
    const dim = 384;
    return {
      data: new Float32Array(count * dim),
      dims: [count, dim],
    };
  }

  async call(_input: string[]): Promise<{ tolist: () => number[][] }> {
    return { tolist: () => [[]] };
  }
}

export async function pipeline(
  _task: string,
  _model: string,
  _opts?: Record<string, unknown>,
): Promise<FeatureExtractionPipeline> {
  return new FeatureExtractionPipeline();
}
