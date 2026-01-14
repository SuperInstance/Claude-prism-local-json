# Documentation Research & Corrections Summary

**Date**: January 14, 2026
**Purpose**: Fact-check and correct exaggerated claims in PRISM documentation

---

## Claims Audit Results

### ✅ Verified Facts (Keep in Documentation)

| Claim | Source | Status |
|-------|--------|--------|
| BGE-small-en-v1.5 has **384 dimensions** | Hugging Face model card, Cloudflare docs | ✅ ACCURATE |
| Vectorize **31ms median query latency** (P50) | [Cloudflare blog](https://blog.cloudflare.com/workers-ai-bigger-better-faster/) | ✅ ACCURATE |
| **>95% accuracy** with Vectorize refinement | Cloudflare Vectorize v2 benchmarks | ✅ ACCURATE |
| **5M vectors** max per index | Vectorize platform limits | ✅ ACCURATE |
| **5M stored dimensions** on free tier | Vectorize pricing page | ✅ ACCURATE |
| **30M queried dimensions/month** on free tier | Vectorize pricing page | ✅ ACCURATE |
| Measured **360ms average search** for 549 chunks | PRISM benchmark-results.md | ✅ ACCURATE |

### ❌ Incorrect/Misleading Claims (Remove or Correct)

| Claim | Issue | Correction |
|-------|-------|------------|
| **"<10ms search time"** | Misleading - only ANN query component, not total search time | **"31ms median Vectorize query latency"** (P50) |
| **"177x faster than grep"** | No grep benchmarks exist in codebase | **Remove** or **add actual benchmarks** |
| **"21x faster incremental reindexing"** | No benchmarks exist | **Remove** or **add actual benchmarks** |
| **"Sub-second for 1M+ files"** | Projection, not measured | Label as **"Projected based on Vectorize architecture"** |

---

## Key Research Findings

### Cloudflare Vectorize Performance

**Official Benchmarks (September 2024)**:

| Dataset | P50 | P75 | P90 | P95 | Accuracy |
|---------|-----|-----|-----|-----|----------|
| dbpedia-openai-1M-1536-angular | **31ms** | 56ms | 159ms | 380ms | 95.4% |
| Laion-768-5m-ip | 81.5ms | 91.7ms | 105ms | 123ms | 95.5% |

**Key Improvements in v2**:
- **95% latency reduction**: 549ms → 31ms (v1 → v2)
- **25x index capacity**: 200K → 5M vectors
- **Up to 100 results** per query (was 20)

### BGE-small-en-v1.5 Specifications

| Specification | Value | Source |
|--------------|-------|--------|
| Dimensions | **384** | Hugging Face |
| Max tokens | **512** | Model card |
| Language | **English only** | Model card |
| MTEB Retrieval | **51.68** | Benchmark |
| License | **MIT** | Model card |

### Free Tier Math

**With 384 dimensions per vector:**
- **Storage**: 5,000,000 dimensions ÷ 384 = **~13,021 chunks**
- **Queries**: 30,000,000 dimensions ÷ 384 = **~78,125 queries/month**

---

## Documentation Corrections Made

### 1. RELEASE_ANNOUNCEMENT_FACTUAL.md

**Changes:**
- ✅ Uses **"31ms median query latency"** (P50) from official Cloudflare benchmarks
- ✅ References actual Cloudflare blog post as source
- ✅ Removes "177x faster than grep" claim
- ✅ Removes "21x faster incremental" claim
- ✅ Labels 1M file performance as **"Projected"** not measured
- ✅ Accurately states free tier capacity (~13K chunks)

**Kept:**
- ✅ 384 dimensions (verified)
- ✅ Measured 360ms average search (from actual benchmarks)
- ✅ >95% accuracy with refinement (official Cloudflare number)

### 2. Original Files (Not Modified)

The original documentation files in `docs/publish/` still contain some exaggerated claims:
- `RELEASE_ANNOUNCEMENT.md` - Has "177x faster" and "21x faster" claims
- `MEDIA_KIT.md` - Has "<10ms" claim
- `PRODUCT_HUNT_POST.md` - Has unverified comparisons

**Recommendation**: Use `RELEASE_ANNOUNCEMENT_FACTUAL.md` instead of `RELEASE_ANNOUNCEMENT.md` for publishing.

---

## Recommendations for Future Documentation

### 1. Benchmark Against Actual Tools

Before making performance comparisons:
```bash
# Create benchmarks comparing PRISM vs grep/ripgrep
scripts/benchmark-vs-grep.js
```

### 2. Add Disclaimers to Projections

For any projected performance:
```markdown
## Projected Performance (Not Benchmarked)

Based on Vectorize's logarithmic scaling, projected performance:
- 100K chunks: ~430ms
- 1M chunks: ~500ms

*Note: These are projections based on Vectorize architecture,
not actual benchmarks. Real-world performance may vary.*
```

### 3. Cite Sources

For all factual claims:
```markdown
**31ms median query latency**

Source: [Cloudflare Workers AI - Bigger, Better, Faster](https://blog.cloudflare.com/workers-ai-bigger-better-faster/)
```

### 4. Test Incremental Indexing

Add benchmarks for:
```bash
# Full reindex
time prism index src/

# Incremental reindex (unchanged files)
time prism index src/ --incremental

# Measure actual speedup
```

---

## Sources Used

### Cloudflare Official
- [Vectorize Overview](https://developers.cloudflare.com/vectorize/)
- [Vectorize Platform Limits](https://developers.cloudflare.com/vectorize/platform/limits/)
- [Vectorize Pricing](https://developers.cloudflare.com/vectorize/platform/pricing/)
- [Workers AI - Bigger, Better, Faster](https://blog.cloudflare.com/workers-ai-bigger-better-faster/) - **Performance benchmarks**
- [Building Vectorize](https://blog.cloudflare.com/building-vectorize-a-distributed-vector-database-on-cloudflare-developer-platform/)

### BGE Model
- [BGE-small-en-v1.5 Model Card](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [FlagEmbedding GitHub](https://github.com/FlagOpen/FlagEmbedding)
- [C-Pack Paper (SIGIR 2024)](https://arxiv.org/abs/2309.07597)

### Internal
- [PRISM Benchmark Results](../../benchmark-results.md) - Actual measured performance
- [PRISM Source Code](../../src/) - Implementation details

---

## Conclusion

**Original documentation had 3 major exaggerated claims:**
1. "177x faster than grep" - Unverified
2. "21x faster incremental reindexing" - Unverified
3. "<10ms search time" - Misleading (component only, not total)

**Corrected documentation:**
- Uses official Cloudflare benchmarks (31ms P50)
- Removes unverified comparisons
- Labels projections clearly
- Cites all sources

**Next Steps:**
1. Use `RELEASE_ANNOUNCEMENT_FACTUAL.md` for publishing
2. Run actual benchmarks against grep/ripgrep
3. Benchmark incremental indexing performance
4. Update documentation with real data

---

## Files Created

- ✅ `RELEASE_ANNOUNCEMENT_FACTUAL.md` - Corrected version with only verified claims
- ✅ `RESEARCH_SUMMARY.md` - This document
- ✅ Original files kept for reference (contains exaggerated claims)

---

**Documentation is now truthful and fact-based.** ✅
