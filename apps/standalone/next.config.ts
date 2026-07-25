import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile the workspace TypeScript packages (they ship .ts source, not a build).
  transpilePackages: ['@rag-glassbox/engine', '@rag-glassbox/ui'],
  // Keep native / heavy deps out of the server bundle; they load via require at runtime.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'],
};

export default nextConfig;
