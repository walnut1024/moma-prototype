// Description text from GPUStack v2.3.1, distributed under Apache-2.0.
// https://github.com/gpustack/gpustack/blob/v2.3.1/gpustack/assets/community-inference-backends.yaml
export const communityBackendDescriptions = {
  "DeepInfer": `OpenAI-compatible text chat completions for DeepSeek-V4.1-Flash, powered by DeepInfer and deepseek-recipe. Requires a single Linux worker with NVIDIA SM100 GPUs (B200/GB200), sufficient GPU and host memory, and working RDMA. Multi-worker deployments and image inputs are not supported.`,
  "Kokoro-FastAPI": `Kokoro-FastAPI (https://github.com/remsky/Kokoro-FastAPI) is a dedicated inference backend for serving the Kokoro TTS model (https://huggingface.co/hexgrad/Kokoro-82M).
Kokoro is an open-weight text-to-speech model with 82 million parameters, delivering quality comparable to much larger models while being significantly faster and more cost-efficient.

Supported model names are strictly limited to:
- kokoro
- tts-1
- tts-1-hd

The backend image includes a built-in model, so the model selected on the Deployments page may be ignored.

Available voices:
af_alloy, af_aoede, af_bella, af_heart, af_jadzia, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky, af_v0, af_v0bella, af_v0irulan, af_v0nicole, af_v0sarah, af_v0sky,
am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa, am_v0adam, am_v0gurney, am_v0michael,
bf_alice, bf_emma, bf_lily, bf_v0emma, bf_v0isabella,
bm_daniel, bm_fable, bm_george, bm_lewis, bm_v0george, bm_v0lewis,
ef_dora, em_alex, em_santa,
ff_siwis,
hf_alpha, hf_beta,
hm_omega, hm_psi,
if_sara, im_nicola,
jf_alpha, jf_gongitsune, jf_nezumi, jf_tebukuro,
jm_kumo,
pf_dora, pm_alex, pm_santa,
zf_xiaobei, zf_xiaoni, zf_xiaoxiao, zf_xiaoyi,
zm_yunjian, zm_yunxi, zm_yunxia, zm_yunyang
`,
  "llama.cpp": `llama.cpp (https://github.com/ggml-org/llama.cpp) is a lightweight, high-performance inference engine for running large language models locally.
It focuses on efficient CPU and edge deployment with minimal dependencies, supporting quantization and broad hardware compatibility.
It enables fast, low-cost LLM inference without requiring GPUs or complex infrastructure.
Only models in the GGUF format are supported.
`,
  "MinerU": `MinerU (https://github.com/opendatalab/mineru) is a document parsing engine that converts complex PDFs into structured, machine-readable formats such as Markdown and JSON.
It was originally developed during the pre-training of InternLM and is particularly strong at handling formulas, symbols, and structured content commonly found in scientific literature.

This inference backend image is built on top of the official MinerU Dockerfile:
https://github.com/opendatalab/MinerU/blob/master/docker/global/Dockerfile

The backend image includes a built-in model, so the model selected on the Deployments page may be ignored.
`,
  "mis-tei": `mis-tei (https://www.hiascend.com/developer/ascendhub/detail/07a016975cc341f3a5ae131f2b52399d) is an inference service for text embedding and reranking models in the Ascend ecosystem.
It provides efficient vector generation and relevance scoring capabilities, commonly used in RAG, semantic search, and retrieval systems.
Based on the Ascend CANN stack, it supports multiple embedding and reranker models with optimized performance on Ascend hardware.
`,
  "Modular MAX": `Modular MAX (https://docs.modular.com/intro) is a heterogeneous inference framework for serving text, embedding, vision, image, video, and audio models on CPUs and NVIDIA or AMD GPUs.
It exposes OpenAI-compatible APIs and the Open Responses API through \`max serve\`.

Model and precision support is architecture-specific. Check the MAX supported-model matrix before deployment:
https://docs.modular.com/models/
`,
  "PaddleX-GenAI-Server": `PaddleX-GenAI-Server is a production-ready serving framework within the PaddleX ecosystem, designed to package PaddleOCR-VL as standardized, high-performance API services.
By integrating advanced inference backends such as vLLM and SGLang, it enables stable, scalable deployment of generative document parsing capabilities in production environments.

For detailed usage instructions, please refer to:
https://www.paddleocr.ai/latest/version3.x/pipeline_usage/PaddleOCR-VL.html
`,
  "TensorRT-LLM": `TensorRT-LLM (https://github.com/NVIDIA/TensorRT-LLM) is NVIDIA's high-performance inference engine for large language models on NVIDIA GPUs.
It provides optimized kernels, in-flight batching, paged KV cache, quantization, and multi-GPU (tensor/pipeline parallelism) support.
The service is launched with \`trtllm-serve\`, exposing an OpenAI-compatible HTTP API.
`,
  "Text-Embeddings-Inference": `TEI (Text Embeddings Inference) is a high-performance engine by Hugging Face specifically optimized for deploying embedding and reranking models on CUDA or CPU.

It is the definitive choice for RAG production environments, offering ultra-low latency and superior throughput compared to general LLM frameworks like vLLM or llama.cpp.
`,
  "TokenSpeed": `TokenSpeed (https://github.com/lightseekorg/tokenspeed) is an OpenAI-compatible
inference engine with hybrid linear-attention support and MTP speculative decoding.
It has no official serving image; build from lightseekorg/tokenspeed-runner
(see tokenspeed/README.md). Use 0.1.3-sm90 on Hopper (H20/H200) and
0.1.3-sm100 on Blackwell (B200/B300).
`,
};
