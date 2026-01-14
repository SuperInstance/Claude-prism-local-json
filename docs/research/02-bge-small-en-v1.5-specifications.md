# BGE-small-en-v1.5 Model Specifications

**Research Date**: 2026-01-14
**Researcher**: Claude (Research Agent)
**Status**: Final

## Overview

BGE-small-en-v1.5 is part of the BAAI General Embedding (BGE) family of models, developed by the Beijing Academy of Artificial Intelligence (BAAI). It is designed for text retrieval and semantic search tasks.

## Key Specifications

### Embedding Dimensions
- **384 dimensions** (confirmed from Hugging Face model card)

### Model Size and Architecture
- **Model**: BAAI/bge-small-en-v1.5
- **Architecture**: Small-scale embedding model
- **Sequence Length**: 512 tokens
- **Language**: English
- **Version**: v1.5 (released September 2023)

### Performance on MTEB Benchmark

| Metric Category | Score | Context |
|-----------------|-------|---------|
| Average (56 tasks) | 62.17 | Overall MTEB benchmark |
| Retrieval (15 tasks) | 51.68 | Information retrieval performance |
| Clustering (11 tasks) | 43.82 | Document clustering |
| Pair Classification (3 tasks) | 84.92 | Classification of text pairs |
| Reranking (4 tasks) | 58.36 | Document reranking |
| STS (10 tasks) | 81.59 | Semantic Text Similarity |
| Summarization (1 task) | 30.12 | Text summarization |
| Classification (12 tasks) | 74.14 | Text classification |

**Comparison Note**: BGE-small-en-v1.5 achieves competitive performance for its size, ranking just behind the base and large versions but offering better efficiency.

## Cloudflare Workers AI Availability

**Confirmed Available**: Yes

Cloudflare Workers AI provides BGE-small-en-v1.5 under the model identifier:
- **Model Name**: `@cf/baai/bge-small-en-v1.5`
- **Task**: Text Embeddings
- **Capabilities**: Batch processing supported
- **Output**: 384-dimensional vectors

**From Cloudflare Documentation**:
> "BAAI general embedding (Small) model that transforms any given text into a 384-dimensional vector - Batch"

## Intended Use Cases

Based on official documentation:

1. **Semantic Search**: Finding relevant passages/documents based on queries
2. **Information Retrieval**: Ranking documents by relevance
3. **Text Similarity**: Computing semantic similarity between texts
4. **Clustering**: Grouping similar documents together
5. **Classification**: Categorizing texts based on semantic content

### Query Instructions

For retrieval tasks (short query to long passage), the recommended instruction prefix is:
```
"Represent this sentence for searching relevant passages:"
```

**Note**: For v1.5 models, the instruction is optional. The model has improved retrieval ability without instructions, with only slight degradation compared to using instructions.

## Known Limitations

### Similarity Score Distribution
- The similarity distribution for BGE models is approximately **[0.6, 1.0]** due to contrastive learning with temperature=0.01
- A similarity score > 0.5 does NOT indicate similarity (relative ordering matters more than absolute values)
- For threshold-based filtering, test appropriate values on your data (e.g., 0.8, 0.85, or 0.9)
- **v1.5 Improvement**: Alleviates similarity distribution issues compared to earlier versions

### Language Support
- Primarily designed for **English text**
- For multilingual support, BAAI recommends BGE-M3 (100+ languages)

### Context Window
- Maximum sequence length: **512 tokens**
- For longer contexts, consider BGE-M3 (8192 tokens) or chunking strategies

## Model Training

From the C-Pack paper (arXiv:2309.07597):

- **Pre-training**: RetroMAE method
- **Fine-tuning**: Large-scale paired data using contrastive learning
- **Training Data**: Massive curated text embedding datasets
- **Release**: SIGIR 2024

## Comparison with Other BGE Models

| Model | Dimensions | MTEB Average | Use Case |
|-------|-----------|--------------|----------|
| bge-small-en-v1.5 | 384 | 62.17 | Efficient, resource-constrained |
| bge-base-en-v1.5 | 768 | 63.55 | Balanced performance/size |
| bge-large-en-v1.5 | 1024 | 64.23 | Maximum accuracy |

## Technical Implementation Details

### Normalization
- Embeddings should be **normalized** before computing cosine similarity
- Use `normalize_embeddings=True` when encoding

### Inference Options

1. **FlagEmbedding library** (official)
   ```python
   from FlagEmbedding import FlagModel
   model = FlagModel('BAAI/bge-small-en-v1.5', use_fp16=True)
   ```

2. **Sentence-Transformers**
   ```python
   from sentence_transformers import SentenceTransformer
   model = SentenceTransformer('BAAI/bge-small-en-v1.5')
   ```

3. **Cloudflare Workers AI**
   ```javascript
   const model = "@cf/baai/bge-small-en-v1.5";
   ```

## License

- **License**: MIT License
- **Commercial Use**: Free for commercial purposes
- **Source**: Hugging Face model card and GitHub repository

## Recommendations for PRISM

### Advantages
1. **Size**: 384 dimensions is efficient for storage and computation
2. **Performance**: Competitive MTEB scores for model size
3. **Cloudflare Support**: Free tier available through Workers AI
4. **No Instruction Required**: v1.5 works well without query prefixes
5. **Cost-effective**: Lower neuron usage than larger models

### Considerations
1. **512 token limit**: May require chunking for long code snippets
2. **English-only**: Not suitable for multilingual codebases
3. **Retrieval-focused**: Optimized for search, not necessarily code understanding

### Token Impact on Cloudflare Free Tier
- **Embedding dimensions**: 384
- **Vectorize storage**: 384 dimensions per chunk
- **Daily free tier**: 5,000,000 stored dimensions
- **Estimated capacity**: ~13,000 chunks (5M / 384) on free tier

## Sources

1. **Hugging Face Model Card**: https://huggingface.co/BAAI/bge-small-en-v1.5
2. **Cloudflare Workers AI Documentation**: https://developers.cloudflare.com/workers-ai/models/embedding/
3. **FlagOpen/FlagEmbedding GitHub**: https://github.com/FlagOpen/FlagEmbedding
4. **C-Pack Paper (SIGIR 2024)**: https://arxiv.org/abs/2309.07597
5. **BAAI Official Resources**: https://github.com/FlagOpen/FlagEmbedding

## Conclusion

BGE-small-en-v1.5 is a well-documented, efficient embedding model suitable for PRISM's token optimization goals. Its 384-dimensional output strikes a good balance between performance and storage efficiency, making it ideal for Cloudflare's free tier constraints. The model's strong retrieval performance (51.68 on MTEB Retrieval tasks) and availability through Cloudflare Workers AI make it a solid choice for the MVP implementation.

**Next Steps**: Compare with code-specific embedding models (CodeBERT, GraphCodeBERT) to determine if domain-specific models offer better performance for code retrieval tasks.
